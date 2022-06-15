import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
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
    let tx = createTransferInstruction(
      from_token_account,
      to_token_account,
      provider.publicKey,
      10000000
    );
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

  const signAndSendTransaction = async () => {
    try {
      const transaction = await createTransferTransaction();
      if (!transaction) return;

      // phantom
      // let signed = await provider.signTransaction(transaction);
      // addLog("Got signature, submitting transaction");
      // let signature = await connection.sendRawTransaction(signed.serialize());
      // addLog("Submitted transaction " + signature + ", awaiting confirmation");

      // brave
      // const { signature } = await window.solana.signAndSendTransaction(
      const { signature } = await window.solana.signAndSendTransaction(
        transaction,
        {
          // Optional maxRetries?: number
          maxRetries: 3, // Maximum number of times for the RPC node to retry sending the transaction to the leader.
          // Optional preflightCommitment?: Commitment
          preflightCommitment: "confirmed" as Commitment, // preflight commitment level
          // Optional skipPreflight?: boolean
          skipPreflight: false, // disable transaction verification step
        }
      );
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

  const signSingleTransction = async () => {
    try {
      const transaction = await createTransferTransaction();
      console.log(transaction);
      const tx = await window.solana.signTransaction(transaction);
      addLog("signTransaction: " + JSON.stringify(tx));
      const signature = await connection.sendRawTransaction(tx.serialize());
      addLog("signature: " + JSON.stringify(signature));
    } catch (err) {
      console.warn(err);
      addLog("[error] signSingleTransction: " + JSON.stringify(err));
    }
  };
  const signSingleTransctionRequest = async () => {
    try {
      const transaction = await createTransferTransaction();
      const tx = await window.solana.request({
        method: "signTransaction",
        params: {
          message: bs58.encode(transaction.serializeMessage()),
        },
      });

      addLog("signTransaction: " + JSON.stringify(tx));
      addLog("signature: " + JSON.stringify(tx.signature));
    } catch (err) {
      console.warn(err);
      addLog("[error] signSingleTransction: " + JSON.stringify(err));
    }
  };

  const signMultipleTransactions = async (onlyFirst: boolean = false) => {
    try {
      const [transaction1, transaction2] = await Promise.all([
        createTransferTransaction(),
        createTransferTransaction(),
      ]);
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

  const signMessage = async (message: string) => {
    try {
      const data = new TextEncoder().encode(message);
      const res = await provider.signMessage(data);
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
        <h1>Phantom Sandbox</h1>

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
              Sign and Send Transaction
            </button>
            <button onClick={signAndSendSplTokenTransaction}>
              Sign and Send SPL Token Transaction
            </button>

            <button onClick={signSingleTransction}>Sign Transaction </button>
            <button onClick={signSingleTransctionRequest}>
              Sign Transaction (Request)
            </button>

            <button onClick={() => signMultipleTransactions(false)}>
              Sign All Transactions (multiple){" "}
            </button>

            <button onClick={() => signMultipleTransactions(true)}>
              Sign All Transactions (single){" "}
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
              Connect to Phantom
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
