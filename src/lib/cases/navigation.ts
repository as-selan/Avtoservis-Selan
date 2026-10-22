/** Reveal an existing section, including a bookmarked section inside collapsed details. */
export function installCaseNavigation() {
 function reveal(hash: string) {
  if(!hash.startsWith('#')||hash.length<2)return;
  let id: string;
  try{id=decodeURIComponent(hash.slice(1));}catch{return;}
  const target=document.getElementById(id);
  if(!target)return;
  let element: HTMLElement|null=target;
  while(element){if(element instanceof HTMLDetailsElement)element.open=true;element=element.parentElement;}
  if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start',behavior:'auto'});
 }
 const onHash=()=>reveal(window.location.hash);
 const onClick=(event: MouseEvent)=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(!(anchor instanceof HTMLAnchorElement)||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
  const url=new URL(anchor.href,window.location.href);
  if(url.origin===window.location.origin&&url.pathname===window.location.pathname&&url.search===window.location.search&&url.hash)reveal(url.hash);
 };
 document.addEventListener('click',onClick);
 window.addEventListener('hashchange',onHash);
 onHash();
 return ()=>{document.removeEventListener('click',onClick);window.removeEventListener('hashchange',onHash);};
}
