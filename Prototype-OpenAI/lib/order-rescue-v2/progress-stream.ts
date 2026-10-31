/** Stream only recorded operation names and the completed review; never model deltas or provider errors. */
export function progressStream<T>(work:(emit:(name:string,status:"started"|"completed"|"skipped")=>void)=>Promise<T>):Response {
 const encoder=new TextEncoder();
 const body=new ReadableStream<Uint8Array>({
  start(controller){
   const send=(event:unknown)=>controller.enqueue(encoder.encode(JSON.stringify(event)+"\n"));
   void (async()=>{
    try{send({type:"accepted"});const result=await work((name,status)=>send({type:"progress",name,status}));send({type:"result",data:result});}
    catch(error){send({type:"error",detail:error instanceof Error&&error.name==="HttpError"?error.message:"The request could not be completed. Refresh the review before retrying."});}
    finally{controller.close();}
   })();
  },
 });
 return new Response(body,{headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store","X-Accel-Buffering":"no"}});
}
