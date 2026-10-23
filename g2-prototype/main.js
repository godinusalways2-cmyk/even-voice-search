import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
const status=document.getElementById('status');
let bridge;
const page=(content)=>({containerTotalNum:1,textObject:[{xPosition:0,yPosition:0,width:576,height:288,containerID:1,containerName:'translation',content,isEventCapture:1}]});
async function connect(){try{bridge=await waitForEvenAppBridge();const result=await bridge.createStartUpPageContainer(page('G2 연결 테스트\\n한국어 표시 성공'));status.textContent='안경 표시 요청 결과: '+String(result);}catch(err){status.textContent='연결 실패: '+String(err?.message||err);}}
document.getElementById('show').onclick=async()=>{if(!bridge)return connect();try{const ok=await bridge.rebuildPageContainer(page('영한 검색기\\n렌즈 표시 테스트'));status.textContent='갱신 결과: '+String(ok);}catch(e){status.textContent=String(e);}};
connect();