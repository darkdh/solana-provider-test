import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableProgram,
  clusterApiUrl,
  SystemProgram,
  Cluster,
  Commitment,
} from "@solana/web3.js";
import "./styles.css";

import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

const bs58 = require("bs58");

type DisplayEncoding = "utf8" | "hex";
type PhantomEvent = "disconnect" | "connect" | "accountChanged";
type PhantomRequestMethod =
  | "connect"
  | "disconnect"
  | "signTransaction"
  | "signAllTransactions"
  | "signMessage";

interface ConnectOpts {
  onlyIfTrusted: boolean;
}

interface PhantomProvider {
  publicKey: PublicKey | null;
  isConnected: boolean | null;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage: (
    message: Uint8Array | string,
    display?: DisplayEncoding
  ) => Promise<any>;
  connect: (opts?: Partial<ConnectOpts>) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  on: (event: PhantomEvent, handler: (args: any) => void) => void;
  request: (method: PhantomRequestMethod, params: any) => Promise<unknown>;
}

const getProvider = (): PhantomProvider | undefined => {
  if ("solana" in window) {
    const anyWindow: any = window;
    const provider = anyWindow.solana;
    if (provider.isPhantom) {
      return provider;
    }
  }
  window.open("https://phantom.app/", "_blank");
};

// Fund will be sent to this account when you're testing v0 transaction with
// lookup table. This is a test only account, please don't send funds on mainnet.
const kTestToPublicKeyInTableLookup = new PublicKey("Ed8JG8SuyLgG6A9Km3PSKtVD8a4Xoqr6cATfswZKbQCW");

export default function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [connection, setConnection] = useState<Connection>(
    new Connection(clusterApiUrl("devnet"))
  );

  const addLog = useCallback(
    (log: string) => setLogs((logs) => [...logs, "> " + log]),
    []
  );

  const provider = getProvider();

  const [, setConnected] = useState<boolean>(false);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);

  const createSplTokenTransferTransaction = async () => {
    if (!provider.publicKey) return;
    const from_token_account = await getAssociatedTokenAddress(
      // token mint address
      new PublicKey("D3tynVS3dHGoShEZQcSbsJ69DnoWunhcgya35r5Dtn4p"),
      // from wallet address
      provider.publicKey
    );
    const to_token_account = await getAssociatedTokenAddress(
      // token mint address
      new PublicKey("D3tynVS3dHGoShEZQcSbsJ69DnoWunhcgya35r5Dtn4p"),
      // to wallet address
      new PublicKey("5ofLtZax45EhkNSkoBrDPdWNonKmijMTsW41ckzPs2r5")
    );
    let ins = createTransferInstruction(
      from_token_account,
      to_token_account,
      provider.publicKey,
      10000000
    );
    let tx = new Transaction().add(ins);
    tx.feePayer = provider.publicKey;
    const anyTransaction: any = tx;
    anyTransaction.recentBlockhash = (
      await connection.getRecentBlockhash("finalized")
    ).blockhash;
    addLog(`blockhash: ${anyTransaction.recentBlockhash} = ${"finalized"}`);
    return tx;
  };

  const createTransferTransaction = async () => {
    if (!provider.publicKey) return;
    let transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: provider.publicKey,
        lamports: 100,
      })
    );
    transaction.feePayer = provider.publicKey;
    addLog("Getting recent blockhash");

    const confimationLvl =
      // "processed" ||
      // "confirmed" ||
      "finalized" || "recent" || "single" || "singleGossip" || "root" || "max";

    const anyTransaction: any = transaction;
    anyTransaction.recentBlockhash = (
      await connection.getRecentBlockhash(confimationLvl)
    ).blockhash;
    addLog(`blockhash: ${anyTransaction.recentBlockhash} = ${confimationLvl}`);
    return transaction;
  };

  const createTransferTransactionV0 = async () => {
    if (!provider.publicKey) return;

    // get latest `blockhash`
    let blockhash = await connection.getLatestBlockhash().then((res) => res.blockhash);

    const instructions = [
      SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: provider.publicKey,
        lamports: 100,
      }),
    ];

    // create v0 compatible message
    const messageV0 = new TransactionMessage({
      payerKey: provider.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    // make a versioned transaction
    const transactionV0 = new VersionedTransaction(messageV0);
    return transactionV0;
  };

  const callSignAndSendTransaction = async (
    transaction: Transaction | VersionedTransaction,
    preflightCommitment: Commitment) => {
    const { signature } = await window.solana.signAndSendTransaction(
      transaction,
      {
        // Optional maxRetries?: number
        maxRetries: 3, // Maximum number of times for the RPC node to retry sending the transaction to the leader.
        // Optional preflightCommitment?: Commitment
        preflightCommitment: preflightCommitment, // preflight commitment level
        // Optional skipPreflight?: boolean
        skipPreflight: false, // disable transaction verification step
      }
    );
    await connection.confirmTransaction(signature);
    addLog("Transaction " + signature.toString() + " confirmed");
    return signature
  };

  /*
  const createAddressLookupTable = async () => {
    if (!provider.publicKey) return;
    // get latest `blockhash`
    let blockhash = await connection.getLatestBlockhash().then((res) => res.blockhash);
    // get current `slot`
    let slot = await connection.getSlot();

    // create an Address Lookup Table
    const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
      authority: provider.publicKey,
      payer: provider.publicKey,
      recentSlot: slot,
    });

    addLog("lookup table address: " + lookupTableAddress.toBase58());

    // To create the Address Lookup Table on chain:
    // send the `lookupTableInst` instruction in a transaction
    const lookupMessage = new TransactionMessage({
      payerKey: provider.publicKey,
      recentBlockhash: blockhash,
      instructions: [lookupTableInst],
    }).compileToV0Message();

    const lookupTransaction = new VersionedTransaction(lookupMessage);
    const lookupSignature = await callSignAndSendTransaction(lookupTransaction, "finalized");
    addLog("Sent transaction for lookup table: " + lookupSignature);

    return lookupTableAddress
  };

  const extendAddressLookupTable = async (lookupTableAddress: PublicKey) => {
    if (!provider.publicKey) return;
    // get latest `blockhash`
    let blockhash = await connection.getLatestBlockhash().then((res) => res.blockhash);

    // add addresses to the `lookupTableAddress` table via an `extend` instruction
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: provider.publicKey,
      authority: provider.publicKey,
      lookupTable: lookupTableAddress,
      addresses: [
        provider.publicKey,
        kTestToPublicKeyInTableLookup,
      ],
    });

    // Send this `extendInstruction` in a transaction to the cluster
    // to insert the listing of `addresses` into your lookup table with address `lookupTableAddress`
    const extensionMessage = new TransactionMessage({
      payerKey: provider.publicKey,
      recentBlockhash: blockhash,
      instructions: [extendInstruction],
    }).compileToV0Message();

    const extensionTransaction = new VersionedTransaction(extensionMessage);
    const extensionSignature = await callSignAndSendTransaction(extensionTransaction, "finalized");
    addLog("Sent transaction for extending lookup table: " + extensionSignature);
  };
  */

  const createTransferTransactionV0WithLookupTable = async (lookupTableAddress: PublicKey) => {
    if (!provider.publicKey) return;
    // get the table from the cluster
    const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress).then((res) => res.value);
    // get latest `blockhash`
    let blockhash = await connection.getLatestBlockhash().then((res) => res.blockhash);

    const instructions = [
      SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: kTestToPublicKeyInTableLookup,
        lamports: 100,
      }),
    ];

    const messageV0 = new TransactionMessage({
      payerKey: provider.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([lookupTableAccount]);

    const transactionV0 = new VersionedTransaction(messageV0);
    return transactionV0;
  };

  const signAndSendTransaction = async () => {
    try {
      const transaction = await createTransferTransaction();
      if (!transaction) return;
      await callSignAndSendTransaction(transaction, "finalized");
    } catch (err) {
      console.warn(err);
      addLog("[error] sendTransaction: " + JSON.stringify(err));
    }
  };

  const signAndSendTransactionV0 = async () => {
    try {
      const transactionV0 = await createTransferTransactionV0();
      if (!transactionV0) return;
      await callSignAndSendTransaction(transactionV0, "finalized");
    } catch (err) {
      console.warn(err);
      addLog("[error] sendTransaction: " + JSON.stringify(err));
    }
  };

  const signAndSendTransactionV0WithLookupTable = async () => {
    try {
      // const lookupTableAddress = await createAddressLookupTable();
      // await extendAddressLookupTable(lookupTableAddress);
      // This address table lookup account was created by above two lines and
      // only on devnet.
      const lookupTableAddress = new PublicKey("CE7eEn3x97iC1qRZPvpJJk2AuPzwchQ6RHSy6f1U1jxu");
      const transactionV0 = await createTransferTransactionV0WithLookupTable(lookupTableAddress);
      if (!transactionV0) return;
      await callSignAndSendTransaction(transactionV0, "finalized");
    } catch (err) {
      console.warn(err);
      addLog("[error] sendTransaction: " + JSON.stringify(err));
    }
  };

  const signAndSendTransactionRequest = async () => {
    try {
      const transaction = await createTransferTransaction();
      if (!transaction) return;

      const { signature } = await window.solana.request({
        method: "signAndSendTransaction",
        params: {
          message: bs58.encode(transaction.serializeMessage()),
          option: {
            // Optional maxRetries?: number
            maxRetries: 3, // Maximum number of times for the RPC node to retry sending the transaction to the leader.
            // Optional preflightCommitment?: Commitment
            preflightCommitment: "confirmed" as Commitment, // preflight commitment level
            // Optional skipPreflight?: boolean
            skipPreflight: false, // disable transaction verification step
          },
        },
      });
      await connection.confirmTransaction(signature);

      addLog("Transaction " + signature.toString() + " confirmed");
    } catch (err) {
      console.warn(err);
      addLog("[error] sendTransaction: " + JSON.stringify(err));
    }
  };
  const signAndSendSplTokenTransaction = async () => {
    try {
      const transaction = await createSplTokenTransferTransaction();
      if (!transaction) return;

      // phantom
      // let signed = await provider.signTransaction(transaction);
      // addLog("Got signature, submitting transaction");
      // let signature = await connection.sendRawTransaction(signed.serialize());
      // addLog("Submitted transaction " + signature + ", awaiting confirmation");
      addLog("created tx:" + JSON.stringify(transaction));
      // brave
      // const { signature } = await window.solana.signAndSendTransaction(
      const { signature } = await window.solana.signAndSendTransaction(
        transaction,
        {
          // Optional maxRetries?: number
          maxRetries: 3, // Maximum number of times for the RPC node to retry sending the transaction to the leader.
          // Optional preflightCommitment?: Commitment
          preflightCommitment: "finalized" as Commitment, // preflight commitment level
          // Optional skipPreflight?: boolean
          skipPreflight: false, // disable transaction verification step
        }
      );
      await connection.confirmTransaction(signature);

      addLog("Transaction " + signature.toString() + " confirmed");
    } catch (err) {
      console.warn(err.code + err.message);
      addLog("[error] sendTransaction: " + JSON.stringify(err));
    }
  };

  const signSingleTransaction = async (v0: boolean = false, lookupTable: boolean = false) => {
    try {
      let transaction;
      if (v0 && lookupTable) {
        const lookupTableAddress = new PublicKey("CE7eEn3x97iC1qRZPvpJJk2AuPzwchQ6RHSy6f1U1jxu");
        transaction = await createTransferTransactionV0WithLookupTable(lookupTableAddress);
      } else if (v0) {
        transaction = await createTransferTransactionV0();
      } else {
        transaction = await createTransferTransaction();
      }
      console.log(transaction);
      const tx = await window.solana.signTransaction(transaction);
      addLog("signTransaction: " + JSON.stringify(tx));
      const signature = await connection.sendRawTransaction(tx.serialize());
      addLog("signature: " + JSON.stringify(signature));
    } catch (err) {
      console.warn(err);
      addLog("[error] signSingleTransaction: " + JSON.stringify(err));
    }
  };
  const signSingleTransactionRequest = async (v0: boolean = false) => {
    try {
      let transaction, message;
      if (v0) {
        transaction = await createTransferTransactionV0();
        message = bs58.encode(transaction.message.serialize());
      } else {
        transaction = await createTransferTransaction();
        message = bs58.encode(transaction.serializeMessage());
      }
      const tx = await window.solana.request({
        method: "signTransaction",
        params: {
          message: message
        },
      });

      addLog("signTransaction: " + JSON.stringify(tx));
    } catch (err) {
      console.warn(err);
      addLog("[error] signSingleTransaction: " + JSON.stringify(err));
    }
  };

  const signMultipleTransactions = async (onlyFirst: boolean = false, v0: boolean = false, lookupTable: boolean = false) => {
    try {
      let transaction1, transaction2;
      if (v0 && lookupTable) {
        const lookupTableAddress = new PublicKey("CE7eEn3x97iC1qRZPvpJJk2AuPzwchQ6RHSy6f1U1jxu");
        [transaction1, transaction2] = await Promise.all([
          createTransferTransactionV0WithLookupTable(lookupTableAddress),
          createTransferTransactionV0WithLookupTable(lookupTableAddress),
        ]);
      } else if (v0) {
        [transaction1, transaction2] = await Promise.all([
          createTransferTransactionV0(),
          createTransferTransactionV0(),
        ]);
      } else {
        [transaction1, transaction2] = await Promise.all([
          createTransferTransaction(),
          createTransferTransaction(),
        ]);
      }
      if (transaction1 && transaction2) {
        let txns;
        if (onlyFirst) {
          txns = await provider.signAllTransactions([transaction1]);
        } else {
          txns = await provider.signAllTransactions([
            transaction1,
            transaction2,
          ]);
        }
        addLog("signMultipleTransactions txns: " + JSON.stringify(txns));

        const sentTxs = await Promise.all(
          txns.map(async (tx) => {
            return connection.sendRawTransaction(tx.serialize());
          })
        );

        addLog("sent raw txns: " + JSON.stringify(sentTxs));
      }
    } catch (err) {
      console.warn(err);
      addLog("[error] signMultipleTransactions: " + JSON.stringify(err));
    }
  };

  const signMultipleTransactionsRequest = async (
    onlyFirst: boolean = false, v0: boolean = false
  ) => {
    try {
      let transaction1, transaction2
      if (v0) {
        [transaction1, transaction2] = await Promise.all([
          createTransferTransactionV0(),
          createTransferTransactionV0(),
        ]);
      } else {
        [transaction1, transaction2] = await Promise.all([
          createTransferTransaction(),
          createTransferTransaction(),
        ]);
      }
      if (transaction1 && transaction2) {
        let txns;
        if (onlyFirst) {
          let message;
          if (v0) {
            message = bs58.encode(transaction1.message.serialize());
          } else {
            message = bs58.encode(transaction1.serializeMessage());
          }
          txns = await window.solana.request({
            method: "signAllTransactions",
            params: {
              message: [message],
            },
          });
        } else {
          let message1, message2;
          if (v0) {
            message1 = bs58.encode(transaction1.message.serialize());
            message2 = bs58.encode(transaction2.message.serialize());
          } else {
            message1 = bs58.encode(transaction1.serializeMessage());
            message2 = bs58.encode(transaction2.serializeMessage());
          }
          txns = await window.solana.request({
            method: "signAllTransactions",
            params: {
              message: [message1, message2],
            },
          });
        }
        addLog("signMultipleTransactions txns: " + JSON.stringify(txns));
      }
    } catch (err) {
      console.warn(err);
      addLog("[error] signMultipleTransactions: " + JSON.stringify(err));
    }
  };

  const signMessage = async (message: string, useHex: boolean = false) => {
    try {
      const data = new TextEncoder().encode(message);
      let res = {};
      if (!useHex) {
        res = await provider.signMessage(data);
      } else {
        res = await provider.signMessage(data, "hex");
      }
      addLog("Message signed " + JSON.stringify(res));
    } catch (err) {
      console.warn(err);
      addLog("[error] signMessage: " + JSON.stringify(err));
    }
  };
  const signMessageRequest = async (
    message: string,
    useHex: boolean = false
  ) => {
    try {
      const data = new TextEncoder().encode(message);
      let res = {};
      if (!useHex) {
        res = await window.solana.request({
          method: "signMessage",
          params: {
            message: data,
          },
        });
      } else {
        res = await window.solana.request({
          method: "signMessage",
          params: {
            message: data,
            display: "hex",
          },
        });
      }
      addLog("Message signed " + JSON.stringify(res));
    } catch (err) {
      console.warn(err);
      addLog("[error] signMessage: " + JSON.stringify(err));
    }
  };

  useEffect(() => {
    addLog(`[cluster changed] ${cluster}`);
  }, [cluster, addLog]);

  useEffect(() => {
    if (!provider) return;
    // try to eagerly connect
    provider.connect({ onlyIfTrusted: true }).catch((err) => {
      // fail silently
    });

    provider.on("connect", (publicKey: PublicKey) => {
      setPublicKey(publicKey);
      setConnected(true);
      addLog("[connect] " + publicKey?.toBase58());
    });

    provider.on("disconnect", () => {
      setPublicKey(null);
      setConnected(false);
      addLog("[disconnect] 👋");
    });

    provider.on("accountChanged", (publicKey: PublicKey | null) => {
      setPublicKey(publicKey);
      if (publicKey) {
        addLog("[accountChanged] Switched account to " + publicKey?.toBase58());
      } else {
        addLog("[accountChanged] Switched unknown account");
        // In this case, dapps could not to anything, or,
        // Only re-connecting to the new account if it is trusted
        // provider.connect({ onlyIfTrusted: true }).catch((err) => {
        //   // fail silently
        // });
        // Or, always trying to reconnect
        provider
          .connect()
          .then(() => addLog("[accountChanged] Reconnected successfully"))
          .catch((err) => {
            addLog("[accountChanged] Failed to re-connect: " + err.message);
          });
      }
    });
    return () => {
      provider.disconnect();
    };
  }, [provider, addLog]);

  if (!provider) {
    return <h2>Could not find a provider</h2>;
  }

  return (
    <div className="App">
      <main>
        <h1>Brave Wallet Sandbox</h1>

        <select
          value={cluster}
          onChange={(e) => {
            const newCluster = e.target.value as Cluster;
            const newConnection = new Connection(clusterApiUrl(newCluster));
            setConnection(newConnection);
            setCluster(newCluster);
          }}
        >
          <option value={"devnet" as Cluster}>devnet</option>
          <option value={"testnet" as Cluster}>testnet</option>
          <option value={"mainnet-beta" as Cluster}>mainnet-beta</option>
        </select>

        {provider && publicKey ? (
          <>
            <div>
              <pre>Connected as</pre>
              <br />
              <pre>{publicKey.toBase58()}</pre>
              <br />
            </div>

            <button onClick={signAndSendTransaction}>
              Sign and Send Transaction (Legacy)
            </button>
            <button onClick={signAndSendTransactionV0}>
              Sign and Send Transaction (v0)
            </button>
            <button onClick={signAndSendTransactionV0WithLookupTable}>
              Sign and Send Transaction (v0 + lookup table) (devnet only)
            </button>
            <button onClick={signAndSendTransactionRequest}>
              Sign and Send Transaction (Request)
            </button>
            <button onClick={signAndSendSplTokenTransaction}>
              Sign and Send SPL Token Transaction
            </button>

            <button onClick={() => signSingleTransaction(false, false)}>
              Sign Transaction
            </button>
            <button onClick={() => signSingleTransactionRequest(false)}>
              Sign Transaction (Request)
            </button>
            <button onClick={() => signSingleTransaction(true, false)}>
              Sign Transaction (v0)
            </button>
            <button onClick={() => signSingleTransactionRequest(true)}>
              Sign Transaction (v0) (Request)
            </button>
            <button onClick={() => signSingleTransaction(true, true)}>
              Sign Transaction (v0 + lookup table)
            </button>

            <button onClick={() => signMultipleTransactions(false)}>
              Sign All Transactions (multiple){" "}
            </button>
            <button onClick={() => signMultipleTransactionsRequest(false, false)}>
              Sign All Transactions (multiple) (Request)
            </button>
            <button onClick={() => signMultipleTransactions(false, true, false)}>
              Sign All Transactions (multiple) (v0)
            </button>
            <button onClick={() => signMultipleTransactionsRequest(false, true)}>
              Sign All Transactions (multiple) (v0) (Request)
            </button>
            <button onClick={() => signMultipleTransactions(false, true, true)}>
              Sign All Transactions (multiple) (v0 + lookup table)
            </button>

            <button onClick={() => signMultipleTransactions(true)}>
              Sign All Transactions (single){" "}
            </button>
            <button onClick={() => signMultipleTransactionsRequest(true, false)}>
              Sign All Transactions (single) (Request)
            </button>

            <button
              onClick={() =>
                signMessage(
                  "To avoid digital dognappers, sign below to authenticate with CryptoCorgis."
                )
              }
            >
              Sign Message
            </button>
            <button
              onClick={() =>
                signMessageRequest(
                  "To avoid digital dognappers, sign below to authenticate with CryptoCorgis."
                )
              }
            >
              Sign Message (Request)
            </button>
            <button
              onClick={() =>
                signMessage(
                  "To avoid digital dognappers, sign below to authenticate with CryptoCorgis.",
                  true
                )
              }
            >
              Sign Message (Hex display)
            </button>
            <button
              onClick={() =>
                signMessageRequest(
                  "To avoid digital dognappers, sign below to authenticate with CryptoCorgis.",
                  true
                )
              }
            >
              Sign Message (Hex display + Request)
            </button>
            <button
              onClick={async () => {
                try {
                  await provider.disconnect();
                } catch (err) {
                  console.warn(err);
                  addLog("[error] disconnect: " + JSON.stringify(err));
                }
              }}
            >
              Disconnect
            </button>
            <button
              onClick={async () => {
                try {
                  await window.solana.request({
                    method: "disconnect",
                  });
                } catch (err) {
                  console.warn(err);
                  addLog("[error] disconnect: " + JSON.stringify(err));
                }
              }}
            >
              Disconnect (Request)
            </button>
          </>
        ) : (
          <>
            <button
              onClick={async () => {
                try {
                  await provider.connect();
                } catch (err) {
                  console.warn(err);
                  addLog("[error] connect: " + JSON.stringify(err));
                }
              }}
            >
              Connect
            </button>
            <button
              onClick={async () => {
                try {
                  await window.solana.request({
                    method: "connect",
                  });
                } catch (err) {
                  console.warn(err);
                  addLog("[error] connect: " + JSON.stringify(err));
                }
              }}
            >
              Connect (Request)
            </button>
            <button
              onClick={async () => {
                try {
                  await provider.connect({ onlyIfTrusted: true });
                } catch (err) {
                  console.warn(err);
                  addLog("[error] eagerly connect: " + JSON.stringify(err));
                }
              }}
            >
              Eagerly Connect
            </button>
            <button
              onClick={async () => {
                try {
                  await window.solana.request({
                    method: "connect",
                    params: { onlyIfTrusted: true },
                  });
                } catch (err) {
                  console.warn(err);
                  addLog("[error] eagerly connect: " + JSON.stringify(err));
                }
              }}
            >
              Eagerly Connect (Request)
            </button>
          </>
        )}
      </main>
      <footer className="logs">
        {logs.map((log, i) => (
          <div className="log" key={i}>
            {log}
          </div>
        ))}
      </footer>
    </div>
  );
}
