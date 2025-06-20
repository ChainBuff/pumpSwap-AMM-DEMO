import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
function findCoinCreatorVault(coinCreator: PublicKey): PublicKey {
  const [derivedAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_vault"), coinCreator.toBuffer()],
    PUMP_AMM_PROGRAM_ID
  );
  console.log("derivedAddress", derivedAddress);

  return derivedAddress;
}
findCoinCreatorVault(
  new PublicKey("2rFmkf5q9fVz5gCu8rftfZnP8rF37sna3hDnu1YNyW3E")
);

/*
derivedAddress PublicKey [PublicKey(6HpANPRTw85fgmSe8ozQmszvyNtR4pHBtkq9DAgqeSqi)] {
  _bn: <BN: 4e990da45622094f77e66a6c82b2d4a28484345176c4655a31dc06102f55bbf5>
}
*/
// const SOL = new PublicKey("11111111111111111111111111111111");
// async function coinCreatorVaultAta() {
//   const coinCreatorVaultAta = await getAssociatedTokenAddress(
//     new PublicKey("6HpANPRTw85fgmSe8ozQmszvyNtR4pHBtkq9DAgqeSqi"),
//     SOL,
//     true
//   );
//   console.log("coinCreatorVaultAta", coinCreatorVaultAta); //9dXMrZzB5Am5fwKp8VYXtnshWDwmSST1TwZpGy24XgDc 不匹配
// }
// coinCreatorVaultAta();
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey([
  140, 151, 37, 143, 78, 36, 137, 241, 187, 61, 16, 41, 20, 142, 13, 131, 11,
  90, 19, 153, 218, 255, 16, 132, 4, 142, 123, 216, 219, 233, 248, 89,
]);
console.log(ASSOCIATED_TOKEN_PROGRAM_ID);
function calculateCoinCreatorVaultAta(
  coinCreatorVaultAuthority: PublicKey,
  quoteTokenProgram: PublicKey,
  quoteMint: PublicKey
): PublicKey {
  const seeds = [
    coinCreatorVaultAuthority.toBuffer(),
    quoteTokenProgram.toBuffer(),
    quoteMint.toBuffer(),
  ];

  const [pda] = PublicKey.findProgramAddressSync(
    seeds,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const targetAta = new PublicKey(
    "eG3Swe7yrufgCmohTV3wbvQnBLyXauQJyJ65uPfKsgX"
  );
  console.log("targetAta", targetAta);
  console.log("fetchResult", pda);
  return pda;
}
const SOL = new PublicKey("So11111111111111111111111111111111111111112");
const quoteTokenProgram = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

const authority = new PublicKey("6HpANPRTw85fgmSe8ozQmszvyNtR4pHBtkq9DAgqeSqi");

calculateCoinCreatorVaultAta(authority, quoteTokenProgram, SOL);
