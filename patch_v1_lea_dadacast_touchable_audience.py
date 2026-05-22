#!/usr/bin/env python3
from pathlib import Path

APP = Path("dadash-app.compiled.js")
INDEX = Path("index.html")
SW = Path("sw.js")


def replace_once(source: str, old: str, new: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected 1 occurrence for {old[:100]!r}, found {count}")
    return source.replace(old, new, 1)


def replace_first(source: str, old: str, new: str) -> str:
    if old not in source:
        raise SystemExit(f"Missing occurrence for {old[:100]!r}")
    return source.replace(old, new, 1)


src = APP.read_text()

src = replace_first(
    src,
    'var fr=lang==="fr";var DADACAST_MIN_SPACING_MS=45000,DADACAST_JITTER_MS=25000,DADACAST_SAFE_CHAT_IDS=function(ids){return ids.map(String).filter(function(id){return/^\\d{5,}$/.test(id)})};var addToast=useToast();',
    'var fr=lang==="fr";var DADACAST_MIN_SPACING_MS=45000,DADACAST_JITTER_MS=25000,DADACAST_SAFE_CHAT_IDS=function(ids){return ids.map(String).filter(function(id){return/^\\d{5,}$/.test(id)})},DADACAST_LEA_TOUCHABLE_IDS=function(ids){return new Set(DADACAST_SAFE_CHAT_IDS(ids))},DADACAST_TOUCHABLE_CHAT_IDS=function(ids,modelName,allowedIds){modelName=String(modelName||"");var safe=DADACAST_SAFE_CHAT_IDS(ids);if(modelName.toLowerCase()==="lea"&&allowedIds&&allowedIds.length){var allowed=DADACAST_LEA_TOUCHABLE_IDS(allowedIds);return safe.filter(function(id){return allowed.has(id)})}return safe};var addToast=useToast();',
)

src = replace_once(
    src,
    'var fr=lang==="fr";var DADACAST_MIN_SPACING_MS=45000,DADACAST_JITTER_MS=25000,DADACAST_SAFE_CHAT_IDS=function(ids){return ids.map(String).filter(function(id){return/^\\d{5,}$/.test(id)})};var addToast=useToast();',
    'var fr=lang==="fr";var DADACAST_MIN_SPACING_MS=45000,DADACAST_JITTER_MS=25000,DADACAST_SAFE_CHAT_IDS=function(ids){return ids.map(String).filter(function(id){return/^\\d{5,}$/.test(id)})},DADACAST_LEA_TOUCHABLE_IDS=function(ids){return new Set(DADACAST_SAFE_CHAT_IDS(ids))},DADACAST_TOUCHABLE_CHAT_IDS=function(ids,modelName,allowedIds){modelName=String(modelName||"");var safe=DADACAST_SAFE_CHAT_IDS(ids);if(modelName.toLowerCase()==="lea"&&allowedIds&&allowedIds.length){var allowed=DADACAST_LEA_TOUCHABLE_IDS(allowedIds);return safe.filter(function(id){return allowed.has(id)})}return safe};var addToast=useToast();',
)

src = replace_once(
    src,
    'var _useState925=useState({}),_useState926=_slicedToArray(_useState925,2),audienceCounts=_useState926[0],setAudienceCounts=_useState926[1];useEffect(function(){var base=(window.TELEGRAM_BOT_URL||"").replace(/\\/$/,"");if(!base)return;fetch("".concat(base,"/api/dadacast/audience-counts")).then(function(r){return r.json()}).then(function(data){if(data&&data.success)setAudienceCounts(data.counts_by_name||{})})["catch"](function(err){return console.warn("[DADACAST] audience-counts fetch failed",err===null||err===void 0?void 0:err.message)})},[]);',
    'var _useState925=useState({}),_useState926=_slicedToArray(_useState925,2),audienceCounts=_useState926[0],setAudienceCounts=_useState926[1];var DADACAST_TOUCHABLE_STATE=useState({}),touchableChatIdsByName=DADACAST_TOUCHABLE_STATE[0],setTouchableChatIdsByName=DADACAST_TOUCHABLE_STATE[1];useEffect(function(){var base=(window.TELEGRAM_BOT_URL||"").replace(/\\/$/,"");if(!base)return;fetch("".concat(base,"/api/dadacast/audience-counts?include_chat_ids=true&days=60"),{headers:carlosHeaders()}).then(function(r){return r.json()}).then(function(data){if(data&&data.success){setAudienceCounts(data.counts_by_name||{});setTouchableChatIdsByName(data.chat_ids_by_name||{})}})["catch"](function(err){return console.warn("[DADACAST] audience-counts fetch failed",err===null||err===void 0?void 0:err.message)})},[]);',
)

src = replace_once(
    src,
    'var modelConvs=React.useMemo(function(){if(!broadcastModel)return conversations;return conversations.filter(function(c){return c.model_id===broadcastModel})},[conversations,broadcastModel]);var tierCounts=React.useMemo(function(){var _models$find25;var counts={};var selectedModelName=(_models$find25=models.find(function(m){return m.id===broadcastModel}))===null||_models$find25===void 0?void 0:_models$find25.name;var dbAllCount=getAudienceCount(selectedModelName);TIERS.forEach(function(t){if(t.id==="all"){counts[t.id]=dbAllCount!==null&&dbAllCount!==void 0?dbAllCount:modelConvs.length;return}counts[t.id]=modelConvs.filter(function(c){var _convTotalsMap$cid;var cid=String(_dmsgChatId(c)||"");var total=(_convTotalsMap$cid=convTotalsMap[cid])!==null&&_convTotalsMap$cid!==void 0?_convTotalsMap$cid:Number(c.total_spent||0);return total>=t.range[0]&&total<t.range[1]}).length});return counts},[modelConvs,convTotalsMap,models,broadcastModel,getAudienceCount]);',
    'var modelConvs=React.useMemo(function(){if(!broadcastModel)return conversations;return conversations.filter(function(c){return c.model_id===broadcastModel})},[conversations,broadcastModel]);var dadashAudiencePool=React.useMemo(function(){var _models$find25;var selectedModelName=((_models$find25=models.find(function(m){return m.id===broadcastModel}))===null||_models$find25===void 0?void 0:_models$find25.name)||"";if(selectedModelName.toLowerCase()==="lea"){var allowed=DADACAST_LEA_TOUCHABLE_IDS(touchableChatIdsByName.lea||[]);if(allowed.size)return modelConvs.filter(function(c){return allowed.has(String(_dmsgChatId(c)||""))})}return modelConvs},[modelConvs,models,broadcastModel,touchableChatIdsByName]);var tierCounts=React.useMemo(function(){var _models$find25;var counts={};var selectedModelName=(_models$find25=models.find(function(m){return m.id===broadcastModel}))===null||_models$find25===void 0?void 0:_models$find25.name;var dbAllCount=getAudienceCount(selectedModelName);TIERS.forEach(function(t){if(t.id==="all"){counts[t.id]=dbAllCount!==null&&dbAllCount!==void 0?dbAllCount:dadashAudiencePool.length;return}counts[t.id]=dadashAudiencePool.filter(function(c){var _convTotalsMap$cid;var cid=String(_dmsgChatId(c)||"");var total=(_convTotalsMap$cid=convTotalsMap[cid])!==null&&_convTotalsMap$cid!==void 0?_convTotalsMap$cid:Number(c.total_spent||0);return total>=t.range[0]&&total<t.range[1]}).length});return counts},[dadashAudiencePool,convTotalsMap,models,broadcastModel,getAudienceCount]);',
)

src = replace_once(
    src,
    'useEffect(function(){if(!broadcastModel)return;var pool=modelConvs;if(selectedTier!=="all"){var tier=TIERS.find(function(t){return t.id===selectedTier});if(tier)pool=pool.filter(function(c){var _convTotalsMap$cid2;var cid=String(_dmsgChatId(c)||"");var total=(_convTotalsMap$cid2=convTotalsMap[cid])!==null&&_convTotalsMap$cid2!==void 0?_convTotalsMap$cid2:Number(c.total_spent||0);return total>=tier.range[0]&&total<tier.range[1]})}setSelectedConvIds(new Set(pool.map(function(c){return String(_dmsgChatId(c))}).filter(Boolean)))},[broadcastModel,selectedTier,modelConvs,convTotalsMap]);',
    'useEffect(function(){if(!broadcastModel)return;var pool=dadashAudiencePool;if(selectedTier!=="all"){var tier=TIERS.find(function(t){return t.id===selectedTier});if(tier)pool=pool.filter(function(c){var _convTotalsMap$cid2;var cid=String(_dmsgChatId(c)||"");var total=(_convTotalsMap$cid2=convTotalsMap[cid])!==null&&_convTotalsMap$cid2!==void 0?_convTotalsMap$cid2:Number(c.total_spent||0);return total>=tier.range[0]&&total<tier.range[1]})}setSelectedConvIds(new Set(pool.map(function(c){return String(_dmsgChatId(c))}).filter(Boolean)))},[broadcastModel,selectedTier,dadashAudiencePool,convTotalsMap]);',
)

src = src.replace(
    '(_getAudienceCount2=getAudienceCount(selectedModel===null||selectedModel===void 0?void 0:selectedModel.name))!==null&&_getAudienceCount2!==void 0?_getAudienceCount2:modelConvs.length',
    '(_getAudienceCount2=getAudienceCount(selectedModel===null||selectedModel===void 0?void 0:selectedModel.name))!==null&&_getAudienceCount2!==void 0?_getAudienceCount2:dadashAudiencePool.length',
)

src = replace_once(
    src,
    '_chatIds=DADACAST_SAFE_CHAT_IDS(Array.from(selectedConvIds));_context217.n=4;return sb.from("scheduled_broadcasts").insert',
    '_chatIds=DADACAST_TOUCHABLE_CHAT_IDS(Array.from(selectedConvIds),modelName,touchableChatIdsByName.lea);_context217.n=4;return sb.from("scheduled_broadcasts").insert',
)

src = replace_once(
    src,
    'chatIds=DADACAST_SAFE_CHAT_IDS(Array.from(selectedConvIds));carlosModelId=(((_models$find28=models.find(function(m){return m.id===broadcastModel}))===null||_models$find28===void 0?void 0:_models$find28.name)||"").toLowerCase();ok=0,fail=0;',
    'carlosModelId=(((_models$find28=models.find(function(m){return m.id===broadcastModel}))===null||_models$find28===void 0?void 0:_models$find28.name)||"").toLowerCase();chatIds=DADACAST_TOUCHABLE_CHAT_IDS(Array.from(selectedConvIds),carlosModelId,touchableChatIdsByName.lea);ok=0,fail=0;',
)

src = replace_once(
    src,
    'var _useState1075=useState([]),_useState1076=_slicedToArray(_useState1075,2),scheduledBroadcasts=_useState1076[0],setScheduledBroadcasts=_useState1076[1];var _useState1077=useState({}),',
    'var _useState1075=useState([]),_useState1076=_slicedToArray(_useState1075,2),scheduledBroadcasts=_useState1076[0],setScheduledBroadcasts=_useState1076[1];var DADACAST_TOUCHABLE_STATE_2=useState({}),touchableChatIdsByName=DADACAST_TOUCHABLE_STATE_2[0],setTouchableChatIdsByName=DADACAST_TOUCHABLE_STATE_2[1];useEffect(function(){var base=(window.TELEGRAM_BOT_URL||"").replace(/\\/$/,"");if(!base)return;fetch("".concat(base,"/api/dadacast/audience-counts?include_chat_ids=true&days=60"),{headers:carlosHeaders()}).then(function(r){return r.json()}).then(function(data){if(data&&data.success)setTouchableChatIdsByName(data.chat_ids_by_name||{})})["catch"](function(err){return console.warn("[DADACAST] touchable audience fetch failed",err===null||err===void 0?void 0:err.message)})},[]);var _useState1077=useState({}),',
)

src = replace_once(
    src,
    'var getAudienceConvs=function getAudienceConvs(audienceId){var aud=BROADCAST_AUDIENCES.find(function(a){return a.id===audienceId});if(!aud)return[];var base=filterModel!=="all"?conversations.filter(function(c){return c.model_id===filterModel}):conversations;return base.filter(function(c){return aud.filter(c,convTotalsMap)})};',
    'var filterDadacastTouchable=function filterDadacastTouchable(list,modelName){if(String(modelName||"").toLowerCase()==="lea"){var allowed=DADACAST_LEA_TOUCHABLE_IDS(touchableChatIdsByName.lea||[]);if(allowed.size)return list.filter(function(c){return allowed.has(String(_dmsgChatId(c)||""))})}return list};var getAudienceConvs=function getAudienceConvs(audienceId){var aud=BROADCAST_AUDIENCES.find(function(a){return a.id===audienceId});if(!aud)return[];var base=filterModel!=="all"?conversations.filter(function(c){return c.model_id===filterModel}):conversations;base=filterDadacastTouchable(base,broadcastModel);return base.filter(function(c){return aud.filter(c,convTotalsMap)})};',
)

src = replace_once(
    src,
    'setSelectedConvIds(new Set(filteredConvs.map(function(c){return String(_dmsgChatId(c))})))',
    'setSelectedConvIds(new Set(filterDadacastTouchable(filteredConvs,broadcastModel).map(function(c){return String(_dmsgChatId(c))})))',
)

src = replace_once(
    src,
    'chatIds=DADACAST_SAFE_CHAT_IDS(Array.from(selectedConvIds));_DADASH_DEBUG&&console.log("[BROADCAST] Starting: ".concat(chatIds.length," chats \\u2022 Model: ").concat(broadcastModel," \\u2022 Type: ").concat(broadcastMedia?broadcastMedia.type:"text"));',
    'chatIds=DADACAST_TOUCHABLE_CHAT_IDS(Array.from(selectedConvIds),broadcastModel,touchableChatIdsByName.lea);_DADASH_DEBUG&&console.log("[BROADCAST] Starting: ".concat(chatIds.length," chats \\u2022 Model: ").concat(broadcastModel," \\u2022 Type: ").concat(broadcastMedia?broadcastMedia.type:"text"));',
)

APP.write_text(src)

for path in (INDEX, SW):
    text = path.read_text()
    text = text.replace("dadash-app.compiled.js?v=lea-safe1", "dadash-app.compiled.js?v=lea-touch1")
    path.write_text(text)

print("V1 Lea Dadacast touchable audience patched")
