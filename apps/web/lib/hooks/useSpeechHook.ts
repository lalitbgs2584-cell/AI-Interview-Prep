import { useCallback, useRef, useState } from "react";
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

type SpeechRecognitionEvent = {
    results: SpeechRecognitionResultList;
    resultIndex: number;
};


export const useSpeechToText = () => {
    const [transcript, setTranscript] = useState("");
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const startListening = useCallback(() => {
        const SpeechRecognition =
            window.SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: any) => {
            let interim = "";
            let finalChunk = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i][0];
                if (event.results[i].isFinal) {
                    finalChunk += result.transcript + " ";
                } else {
                    interim += result.transcript;
                }
            }

            if (finalChunk) {
                setTranscript(prev => prev + finalChunk);
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error:", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, []);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    return { transcript, isListening, startListening, stopListening };
};