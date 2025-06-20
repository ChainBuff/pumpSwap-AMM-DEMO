import { Keypair, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

// config
export const RPC_ENDPOINT =
  process.env.SOLANA_NODE_RPC_ENDPOINT || "https://solana-rpc.publicnode.com";
//   token account
export const TOKEN_MINT = new PublicKey(
  "Dk7Xy5sYRvQrLLXXJ31fLWiB6E6Es773asXgedkSpump"
);
//
export const PRIVATE_KEY = bs58.decode(process.env.SOLANA_PRIVATE_KEY || "");
export const PAYER = Keypair.fromSecretKey(PRIVATE_KEY);
//
export const SLIPPAGE = 0.05;
export const TOKEN_DECIMALS = 6;

// 函数标识符 签名
export const BUY_DISCRIMINATOR = Buffer.from("66063d1201daebea", "hex");

// Accounts
export const SOL = new PublicKey("So11111111111111111111111111111111111111112");
export const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
export const PUMP_SWAP_GLOBAL_CONFIG = new PublicKey(
  "ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw"
);
export const PUMP_PROTOCOL_FEE_RECIPIENT = new PublicKey(
  "7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ"
);
export const PUMP_PROTOCOL_FEE_RECIPIENT_TOKEN_ACCOUNT = new PublicKey(
  "7GFUN3bWzJMKMRZ34JLsvcqdssDbXnp589SiE33KVwcC"
);
export const PUMP_SWAP_EVENT_AUTHORITY = new PublicKey(
  "GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR"
);
// CU limit price
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const COMPUTE_UNIT_PRICE = 6666666;
export const COMPUTE_UNIT_BUDGET = 150_000;
