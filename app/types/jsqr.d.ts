// app/types/jsqr.d.ts
declare module "jsqr" {
  export type InversionAttempts = "dontInvert" | "onlyInvert" | "attemptBoth";

  export interface QRCode {
    data: string;
    binaryData: Uint8ClampedArray;
    location: any; // você pode refinar se quiser
  }

  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: InversionAttempts }
  ): QRCode | null;
}
