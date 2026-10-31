export function photoKind(bytes:Uint8Array):"jpeg"|"png"|"webp"|null{
 if(bytes.length<4||bytes.length>786432)return null;
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "jpeg";
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "png";
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "webp";
 return null;
}
