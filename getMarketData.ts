/**
 * Solana PUMP AMM Interface
 *
 * This module provides functionality to interact with the PUMP AMM program on Solana, enabling:
 * - Finding market addresses by token mint
 * - Fetching and parsing market data from PUMP AMM pools
 * - Calculating token prices in AMM pools
 * - Creating associated token accounts (ATAs) idempotently
 * - Buying tokens on the PUMP AMM with slippage protection
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  AccountMeta,
  VersionedTransaction,
  TransactionMessage,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import * as dotenv from "dotenv";

dotenv.config();

// 敞亮配置
const RPC_ENDPOINT =
  process.env.SOLANA_NODE_RPC_ENDPOINT || "https://solana-rpc.publicnode.com";

const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
interface MarketData {
  pool_bump: number;
  index: number;
  creator: string;
  base_mint: string;
  quote_mint: string;
  lp_mint: string;
  pool_base_token_account: string;
  pool_quote_token_account: string;
  lp_supply: number;
  coin_creator: string;
}

async function getMarketData(
  connection: Connection,
  marketAddress: PublicKey
): Promise<MarketData> {
  const response = await connection.getAccountInfo(marketAddress, "confirmed");

  if (!response || !response.data) {
    throw new Error("Market account not found");
  }
  const data = response.data;

  if (!Buffer.isBuffer(data)) {
    throw new Error("Expected Buffer data from account info");
  }

  const parsedData: Partial<MarketData> = {};

  // Start after the 8-byte discriminator
  let offset = 8;

  // Define the structure of the market account data
  const fields: Array<[keyof MarketData, string]> = [
    ["pool_bump", "u8"],
    ["index", "u16"],
    ["creator", "pubkey"],
    ["base_mint", "pubkey"],
    ["quote_mint", "pubkey"],
    ["lp_mint", "pubkey"],
    ["pool_base_token_account", "pubkey"],
    ["pool_quote_token_account", "pubkey"],
    ["lp_supply", "u64"],
    ["coin_creator", "pubkey"],
  ];

  for (const [fieldName, fieldType] of fields) {
    if (fieldType === "pubkey") {
      const value = data.subarray(offset, offset + 32);
      parsedData[fieldName] = bs58.encode(value) as any;
      offset += 32;
    } else if (fieldType === "u64" || fieldType === "i64") {
      const value = data.readBigUInt64LE(offset);
      parsedData[fieldName] = Number(value) as any;
      offset += 8;
    } else if (fieldType === "u16") {
      const value = data.readUInt16LE(offset);
      parsedData[fieldName] = value as any;
      offset += 2;
    } else if (fieldType === "u8") {
      const value = data.readUInt8(offset);
      parsedData[fieldName] = value as any;
      offset += 1;
    }
  }
  console.log("marketData");
  console.log(parsedData);
  return parsedData as MarketData;
}

const connection = new Connection(RPC_ENDPOINT, "confirmed");
getMarketData(
  connection,
  new PublicKey("2MY9H84iFRwNGYfCirQUdt2kdmWUK87akTt1agiAe59c")
).catch((err) => console.error(err));
/*
{
  pool_bump: 254,
  index: 0,
  creator: 'AHcsV4D1o4A6aL8Zmh6CBu8tEZ6mojG4k1r9mYrpSSAa',
  base_mint: '3Y7uP2UhEE68dpyAmWfXc7biSQmQqQonCiyDp6KYpump',
  quote_mint: 'So11111111111111111111111111111111111111112',
  lp_mint: '54WPVVRsmZvR1WchkAcUHvMpp34wx8NAWRd1Fg1v8vbW',
  pool_base_token_account: '6iStiZfzQd3MMj7v1qMrfDXSPGZEqrJ2J3PsEVgcH9Vz',
  pool_quote_token_account: '7yGtQPNjUgg4uiZa6yALPB8Uni2jXaGD1Srh5n1daikL',
  lp_supply: 4195261632540,
  coin_creator: 'CkYzGwRzEBwk3fX7SAmrhBazoLvzXozNmMfA4tFguDLt'
}*/