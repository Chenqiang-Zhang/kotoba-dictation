export type VoiceManifest={voices:{id:string;label:string;credit:string;sample:string}[];clips:Record<string,Record<string,string>>};
export const SAMPLE_TEXT='こんにちは。今日も少しずつ、日本語を練習しましょう。';
export function questionTexts(index:number,word:{reading:string;example?:string|null}){return [`第${index+1}問。`,`${word.reading}。`,...(word.example?[word.example]:[])];}
export function questionClips(manifest:VoiceManifest,voice:string,index:number,word:{reading:string;example?:string|null}){return questionTexts(index,word).map(text=>{const src=manifest.clips[text]?.[voice];if(!src)throw new Error('本题的自然语音尚未生成，请更新词库语音，或在语音设置中选择设备日语语音。');return src;});}
/** Fetch complete files without Range; media plays local Blob URLs, including on iPhone. */
export class PreparedAudio {
 private generation=0;
 private controller:AbortController|undefined;
 private urls=new Map<string,string>();
 private disposed=false;
 private ready=false;
 private fetchClip:typeof fetch;
 private createURL:(blob:Blob)=>string;
 private revokeURL:(url:string)=>void;
 constructor(fetchClip:typeof fetch=globalThis.fetch.bind(globalThis),createURL:(blob:Blob)=>string=blob=>URL.createObjectURL(blob),revokeURL:(url:string)=>void=url=>URL.revokeObjectURL(url)){this.fetchClip=fetchClip;this.createURL=createURL;this.revokeURL=revokeURL;}
 private clear(){this.controller?.abort();this.controller=undefined;for(const url of this.urls.values())this.revokeURL(url);this.urls.clear();this.ready=false;}
 dispose(){this.disposed=true;this.generation++;this.clear();}
 get(src:string){const url=this.urls.get(src);if(!this.ready||!url)throw new Error('语音尚未准备好，请等待加载完成后再点击。');return url;}
 async prepare(sources:string[],progress:(loaded:number,total:number)=>void=()=>{}){
  if(this.disposed)throw new Error('语音准备已取消。');
  const generation=++this.generation;this.clear();const controller=new AbortController();this.controller=controller;
  const unique=[...new Set(sources)];let next=0,loaded=0;
  const current=()=>!this.disposed&&generation===this.generation&&!controller.signal.aborted;
  progress(0,unique.length);
  try{
   await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{
    while(current()&&next<unique.length){const src=unique[next++];
     const response=await this.fetchClip(src,{signal:controller.signal});
     if(!current())return;
     if(!response.ok)throw new Error(`语音加载失败（${response.status}），请检查网络后重试。`);
     const blob=await response.blob();if(!current())return;
     if(!blob.size||!blob.type.toLowerCase().startsWith('audio/'))throw new Error('没有收到有效的语音文件，请重新加载；若持续失败，请更新词库语音。');
     this.urls.set(src,this.createURL(blob));progress(++loaded,unique.length);
    }
   }));
   if(!current())return false;
   this.ready=true;return true;
  }catch(error){if(!current())return false;this.generation++;this.clear();throw error;}
 }
}
export function sessionClips(manifest:VoiceManifest,voice:string,words:{reading:string;example?:string|null}[]){
 const sample=manifest.voices.find(v=>v.id===voice)?.sample;if(!sample)throw new Error('试听语音尚未生成，请更新词库语音。');
 return [...new Set([sample,...words.flatMap((word,index)=>questionClips(manifest,voice,index,word))])];
}
/** Each actual completion can advance once. Cancellation invalidates stale media events and timers. */
export class PlaybackSequence {
 private generation=0;
 private cancelStep:(()=>void)|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private schedule:typeof setTimeout;
 private clear:typeof clearTimeout;
 constructor(schedule:typeof setTimeout=globalThis.setTimeout.bind(globalThis),clear:typeof clearTimeout=globalThis.clearTimeout.bind(globalThis)){this.schedule=schedule;this.clear=clear;}
 cancel(){this.generation++;if(this.timer)this.clear(this.timer);this.timer=undefined;this.cancelStep?.();this.cancelStep=undefined;}
 start(steps:string[],play:(value:string,end:()=>void,error:()=>void)=>(()=>void),between:number,writingGap:number,complete:()=>void,failed:()=>void){
  this.cancel();const generation=this.generation;let index=0;
  const next=()=>{if(generation!==this.generation)return;let settled=false;
   this.cancelStep=play(steps[index],()=>{if(settled||generation!==this.generation)return;settled=true;index++;this.timer=this.schedule(()=>{this.timer=undefined;if(generation!==this.generation)return;if(index===steps.length)complete();else next();},index===steps.length?writingGap:between);},()=>{if(settled||generation!==this.generation)return;settled=true;this.cancel();failed();});
  };if(steps.length)next();else failed();
 }
}
