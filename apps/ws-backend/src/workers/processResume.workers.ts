import { subscriber } from "../config/redis.config.js";
import { storeToDB } from "../worker-helper/storeDb.worker-helper.js";
import { io } from "../index.js";

subscriber.subscribe('resume:processed', (err) => {
    if (err) console.error('Subscribe failed:', err);
    console.log('Listening for resume events...');
});

subscriber.on('message', async (channel, message) => {
    const { event_type, payload } = JSON.parse(message);

    switch (event_type) {
        case 'neon.store':
            const result =await storeToDB(payload)
            if(result?.success){
                console.log('Resume stored for user:', payload.user_id);
            }
            else{
                console.log('Failed to store for user:', payload.user_id);
            }
            break;
        case 'budget_exceeded':
            if (payload?.user_id) {
                io.to(`user:${payload.user_id}`).emit("budget_exceeded", {
                    scope: "resume",
                    message: payload.message || "Daily interview limit reached. Resets at midnight.",
                });
            }
            break;

        default:
            console.warn('Unknown event type:', event_type);
    }
});
