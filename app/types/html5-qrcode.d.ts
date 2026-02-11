// app/types/html5-qrcode.d.ts
declare module "html5-qrcode" {
  export type CameraDevice = { id: string; label: string };

  export interface Html5QrcodeCameraScanConfig {
    fps?: number;
    qrbox?: number | { width: number; height: number };
    aspectRatio?: number;
    formatsToSupport?: number[];
  }

  export class Html5Qrcode {
    constructor(elementId: string);

    start(
      cameraConfig:
        | { facingMode: "user" | "environment" }
        | { deviceId: { exact: string } },
      config?: Html5QrcodeCameraScanConfig,
      onSuccess?: (decodedText: string, decodedResult: unknown) => void,
      onError?: (errorMessage: string, decodedResult: unknown) => void
    ): Promise<void>;

    stop(): Promise<void>;
    clear(): Promise<void>;

    static getCameras(): Promise<CameraDevice[]>;
  }

  export const Html5QrcodeSupportedFormats: {
    QR_CODE: number;
    [k: string]: number;
  };
}
