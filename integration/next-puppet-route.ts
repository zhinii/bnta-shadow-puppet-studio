// Install as app/api/puppet/route.ts and adjust the import to the copied modules.
import {handleApi,config} from '../../../puppet/server/api.mjs';
const origins=new Set(['https://zhinii.github.io','https://bnta-shadow-puppet-studio.zhinii.chatgpt.site','http://127.0.0.1:4237']);
function cors(origin:string){return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};}
export async function OPTIONS(request:Request){const origin=request.headers.get('origin')||'';return new Response(null,{status:origins.has(origin)?204:403,headers:origins.has(origin)?cors(origin):{}});}
export async function POST(request:Request){
 const origin=request.headers.get('origin')||'';
 if(origin&&!origins.has(origin))return Response.json({error:'origin'},{status:403});
 // Retain the host's existing authentication/membership middleware here.
 const env={ALIBABA_API_KEY:process.env.ALIBABA_API_KEY,QIANWEN_API_KEY:process.env.QIANWEN_API_KEY,DASHSCOPE_API_KEY:process.env.DASHSCOPE_API_KEY,ALIBABA_BASE_URL:process.env.ALIBABA_BASE_URL,ALIBABA_MODEL:process.env.ALIBABA_MODEL};
 if(!config(env))return Response.json({error:'server_configuration'},{status:503,headers:origin?cors(origin):{}});
 // Origin was checked above; the shared same-origin adapter receives a local request.
 const headers=new Headers(request.headers);headers.delete('origin');
 const url=new URL(request.url);url.pathname='/api/puppet';
 const local=new Request(url,{method:'POST',headers,body:request.body,duplex:'half'} as RequestInit);
 const result=await handleApi(local,env);
 const outgoing=new Headers(result.headers);if(origin)for(const [k,v]of Object.entries(cors(origin)))outgoing.set(k,v);
 return new Response(result.body,{status:result.status,headers:outgoing});
}
