import { TelegramService } from "@/services/telegram.services.js";
import { error } from "console";
import type { Request, Response } from "express";
import { z } from "zod";

const CreateTelegramLinkSessionSchema = z.object({
    subscriptionId: z.uuid(),
    userId: z.string().min(1),
})

export const TelegramController = {
    create: async (_req: Request, res: Response) => {
        try{
         const {data: parsedData, error } = CreateTelegramLinkSessionSchema.safeParse(_req.body); // returns {success: true, data: T } or {success: false, error: ZodError}
         if (error) {
            console.log("Error parsing request body through CreateTelegramLinkSessionSchema (create function in telegram.controllers.ts): ", parsedData);
             return res.status(400).json({ error: error.message });
         }
         // If parsing is successful, you can use parsedData
         const { subscriptionId, userId } = parsedData;
         // Call the service to create the link session
         const linkSession = await TelegramService.createLinkSession(subscriptionId, userId);
         return res.status(201).json(linkSession);
        } catch (error) {
            console.log("Error in create function in telegram.controllers.ts: ", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}