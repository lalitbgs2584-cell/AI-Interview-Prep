import { io, Socket } from "socket.io-client";

let socket: Socket;

export const getSocket = (): Socket => {
    if (!socket) {
        socket = io(process.env.NEXT_PUBLIC_API_URL!, {
            transports: ["websocket"],
            withCredentials: true,
        });
    }
    return socket;
}