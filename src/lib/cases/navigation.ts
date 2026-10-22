/** Reveal the existing form, including a bookmarked section inside collapsed details. */
export function revealCaseSection(hash:string){
 if(!hash.startsWith('#')||hash.length<2)return false;
 let id:string;
 try{id=decodeURIComponent(hash.slice(1));}catch{return false;}
 const target=document.getElementById(id);
 if(!target)return false;
 let element:HTMLElement|null=target;
 while(element){if(element instanceof HTMLDetailsElement)element.open=true;element=element.parentElement;}
 if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
 target.focus({preventScroll:true});
 target.scrollIntoView({block:'start',behavior:'auto'});
 return true;
}
/** A refreshed business step reveals its next form without interrupting an edit. */
export function advanceCaseNavigation(href:string,editedElement:HTMLElement|null=null){
 const focused=document.activeElement===document.body&&editedElement?.isConnected?editedElement:document.activeElement;
 if(focused instanceof HTMLElement&&(focused.isContentEditable||focused.matches('input,textarea,select'))){
  // A background refresh can move the edited section into secondary details.
  let ancestor:HTMLElement|null=focused;
  while(ancestor){if(ancestor instanceof HTMLDetailsElement)ancestor.open=true;ancestor=ancestor.parentElement;}
  if(focused!==document.activeElement){focused.focus({preventScroll:true});focused.scrollIntoView({block:"nearest"});}
  return false;
 }
 if(!revealCaseSection(href))return false;
 const url=new URL(window.location.href);url.hash=href;
 window.history.replaceState(window.history.state,'',url);
 return true;
}
export function installCaseNavigation(){
 const onHash=()=>revealCaseSection(window.location.hash);
 const onClick=(event:MouseEvent)=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(!(anchor instanceof HTMLAnchorElement)||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
  const url=new URL(anchor.href,window.location.href);
  if(url.origin===window.location.origin&&url.pathname===window.location.pathname&&url.search===window.location.search&&url.hash)revealCaseSection(url.hash);
 };
 document.addEventListener('click',onClick);
 window.addEventListener('hashchange',onHash);
 onHash();
 return ()=>{document.removeEventListener('click',onClick);window.removeEventListener('hashchange',onHash);};
}
