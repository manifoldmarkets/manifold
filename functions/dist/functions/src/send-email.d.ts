import * as mailgun from 'mailgun-js';
export declare const sendTextEmail: (to: string, subject: string, text: string, options?: Partial<mailgun.messages.SendData>) => Promise<mailgun.messages.SendResponse | null>;
export declare const sendTemplateEmail: (to: string, subject: string, templateId: string, templateData: Record<string, string>, options?: Partial<mailgun.messages.SendTemplateData>) => Promise<mailgun.messages.SendResponse | null>;
