import { create } from "zustand";

interface Question {
  interviewId: string;
  index: number;
  difficulty: "intro" | "easy" | "medium" | "hard";
  question: string;
  time: number;
}
interface Message {
  id: number;
  role: "ai" | "user";
  text: string;
  time: string;
}

interface InterviewStore {
  interviewId: string | null;
  interviewTitle: string | null;
  interviewType: string | null;
  currentQuestion: Question | null;
  messages: Message[];

  setInterviewId: (id: string) => void;
  setInterviewMeta: (title: string | null, type: string | null) => void;
  setCurrentQuestion: (q: Question) => void;
  addMessage: (m: Message) => void;
  clearCurrentQuestion: () => void;
  reset: () => void;
}

export const useInterviewStore = create<InterviewStore>((set) => ({
  interviewId: null,
  interviewTitle: null,
  interviewType: null,
  currentQuestion: null,
  messages: [],

  setInterviewId: (id) => set({ interviewId: id }),
  setInterviewMeta: (title, type) => set({ interviewTitle: title, interviewType: type }),
  setCurrentQuestion: (q) => set({ currentQuestion: q }),
  addMessage: (m) => set((state) => ({ messages: [...state.messages, m] })),
  clearCurrentQuestion: () => set({ currentQuestion: null }),
  reset: () =>
    set({
      interviewId: null,
      interviewTitle: null,
      interviewType: null,
      currentQuestion: null,
      messages: [],
    }),
}));
