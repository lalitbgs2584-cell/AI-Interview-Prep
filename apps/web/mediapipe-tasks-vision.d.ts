declare module "@mediapipe/tasks-vision" {
  export class FilesetResolver {
    static forVisionTasks(wasmFileset: string): Promise<any>;
  }

  export interface Detection {
    boundingBox?: {
      originX: number;
      originY: number;
      width: number;
      height: number;
    };
    categories: Array<{ score: number; categoryName: string }>;
    keypoints?: Array<{ x: number; y: number }>;
  }

  export interface FaceDetectorResult {
    detections: Detection[];
  }

  export class FaceDetector {
    static createFromOptions(
      vision: any,
      options: {
        baseOptions: {
          modelAssetPath: string;
          delegate?: "GPU" | "CPU";
        };
        runningMode: "IMAGE" | "VIDEO";
        minDetectionConfidence?: number;
        minSuppressionThreshold?: number;
      }
    ): Promise<FaceDetector>;

    detectForVideo(
      video: HTMLVideoElement,
      timestamp: number
    ): FaceDetectorResult;

    close(): void;
  }
}