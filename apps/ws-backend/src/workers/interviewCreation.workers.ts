import { redisClient, subscriber } from "../config/redis.config.js";
import { io } from "../index.js";

// Subscribe to all interview event channels
subscriber.psubscribe("interview:*:events", (err) => {
    if (err) console.error("Pattern subscribe failed:", err);
    console.log("Listening for interview events...");
});

// -----------------------------
// TYPE DEFINITIONS
// -----------------------------

interface QuestionEvent {
    type: "question";
    index: number;         // 0-based question number
    difficulty: "intro" | "easy" | "medium" | "hard";
    question: string;
    time: number;
}

interface InterviewCompleteEvent {
    type: "interview_complete";
    summary: {
        summary: string;
        strengths: string[];
        weaknesses: string[];
        overall_score: number;   // 0-10
        recommendation: "Hire" | "Strong Hire" | "No Hire" | "Needs More Evaluation";
    };
}

type InterviewEvent = QuestionEvent | InterviewCompleteEvent;

// -----------------------------
// PATTERN MESSAGE HANDLER
// -----------------------------

subscriber.on("pmessage", async (pattern: string, channel: string, message: string) => {

    let data: InterviewEvent;

    try {
        data = JSON.parse(message);
        console.log(data)
    } catch (err) {
        console.error(`[subscriber] Failed to parse message on ${channel}:`, message);
        return;
    }

    // channel format → interview:12345:events
    const interviewId = channel.split(":")[1];
    console.log("In interview creation wokers helpers.")
    console.log(`[interview:${interviewId}] Event received: ${data.type}`);

    switch (data.type) {

        // -----------------------------------------------------------------
        // Published by: publish_question node
        // Fired:        once per question (including follow-ups)
        //
        // On first question (index 0, difficulty "intro"):
        //   → Show warm intro prompt to candidate UI
        // On follow-ups:
        //   → publish_question is re-entered WITHOUT generate_question,
        //     so index will be the SAME as the previous question but
        //     current_question will be the follow-up text from evaluate_answer
        // -----------------------------------------------------------------
        case "question": {
            const { index, difficulty, question, time } = data as QuestionEvent;  // add time to interface too

            const payload = {
                interviewId,
                index,           // ← was "questionNumber", change to "index"
                difficulty,
                question,
                time: time ?? Date.now(),  // ← add time
            };

            await redisClient.set(
                `interview:${interviewId}:current_question`,
                JSON.stringify(payload),
                "EX", 3600
            );

            io.to(`interview:${interviewId}`).emit("interview:question", payload);
            break;
        }

        // -----------------------------------------------------------------
        // Published by: finalize node
        // Fired:        once at the very end of the interview
        // -----------------------------------------------------------------
        case "interview_complete": {
            const { summary } = data as InterviewCompleteEvent;

            console.log(`[interview:${interviewId}] Interview complete`);
            console.log(`  Score:          ${summary.overall_score}/10`);
            console.log(`  Recommendation: ${summary.recommendation}`);
            console.log(`  Summary:        ${summary.summary}`);
            console.log(`  Strengths:      ${summary.strengths.join(", ")}`);
            console.log(`  Weaknesses:     ${summary.weaknesses.join(", ")}`);

            io.to(`interview:${interviewId}`).emit("interview:complete", {
                interviewId,
                summary,
            });

            break;
        }

        default: {
            console.warn(`[interview:${interviewId}] Unknown event type:`, data);
        }
    }
});