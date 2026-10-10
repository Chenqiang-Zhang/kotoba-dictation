import { requireChatGPTUser } from './chatgpt-auth';
import Dictation from './dictation';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/');return <Dictation/>;}
