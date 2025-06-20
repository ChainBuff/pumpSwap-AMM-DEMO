import {
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { PAYER } from "./constans";

function createCloseTokenAccountInstruction(
  accountToClose: PublicKey,
  authority: PublicKey,
  destination?: PublicKey
): TransactionInstruction {
  const destinationAddress = destination || authority;

  return createCloseAccountInstruction(
    accountToClose,
    destinationAddress,
    authority,
    [],
    TOKEN_PROGRAM_ID
  );
}

const RPC_ENDPOINT =
  process.env.SOLANA_NODE_RPC_ENDPOINT || "https://solana-rpc.publicnode.com";

const connection = new Connection(RPC_ENDPOINT, "confirmed");

const main = async () => {
  const closeWsolAtaIx = createCloseTokenAccountInstruction(
    new PublicKey("G4JfLukgAm28cqzFFYGkbTzdo8T3HpSPy3WUSt1uqpdG"),
    PAYER.publicKey
  );
  const tx = new Transaction();
  const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 50_000,
  });
  tx.add(computeIx);
  tx.add(closeWsolAtaIx);
  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [PAYER], // 签名者
    {
      commitment: "confirmed",
      skipPreflight: false,
    }
  );
  console.log(`✅ 交易成功: ${signature}`);
  console.log(`🔗 Solscan: https://solscan.io/tx/${signature}`);

  return signature;
};
main().catch((err) => console.log(err));
