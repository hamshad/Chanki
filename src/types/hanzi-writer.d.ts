declare module 'hanzi-writer' {
  export interface HanziWriterOptions {
    width?: number;
    height?: number;
    padding?: number;
    showOutline?: boolean;
    strokeAnimationSpeed?: number;
    delayBetweenStrokes?: number;
    strokeColor?: string;
    radicalColor?: string;
    highlightColor?: string;
    outlineColor?: string;
    drawingColor?: string;
    leniency?: number;
    showHintAfterMisses?: number;
    highlightOnComplete?: boolean;
    charDataLoader?: (char: string, onLoad: (data: any) => void, onError: (err: any) => void) => void;
  }

  export default class HanziWriter {
    static create(element: string | HTMLElement, character: string, options?: HanziWriterOptions): HanziWriter;
    
    quiz(options?: {
      onMistake?: (strokeData: any) => void;
      onCorrectStroke?: (strokeData: any) => void;
      onComplete?: (summaryData: any) => void;
    }): void;
    
    cancelQuiz(): void;
    setCharacter(char: string): void;
    animateCharacter(): void;
    destroy(): void;
    updateColor(colorName: string, colorVal: string): void;
  }
}
