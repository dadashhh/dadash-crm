#!/usr/bin/env python3
from pathlib import Path

APP = Path("dadash-app.compiled.js")
INDEX = Path("index.html")
SW = Path("sw.js")


def replace_once(source: str, old: str, new: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected 1 occurrence for {old[:80]!r}, found {count}")
    return source.replace(old, new, 1)


def replace_exact_count(source: str, old: str, new: str, expected: int) -> str:
    count = source.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} occurrences for {old[:80]!r}, found {count}")
    return source.replace(old, new)


src = APP.read_text()

src = replace_once(
    src,
    'var DadacastSubpage=React.memo(function(_ref494){var _getAudienceCount2,_TIERS$find3,_TIERS$find4;var _ref494$conversations=_ref494.conversations,conversations=_ref494$conversations===void 0?[]:_ref494$conversations,_ref494$convTotalsMap=_ref494.convTotalsMap,convTotalsMap=_ref494$convTotalsMap===void 0?{}:_ref494$convTotalsMap,_ref494$models=_ref494.models,models=_ref494$models===void 0?[]:_ref494$models,lang=_ref494.lang,user=_ref494.user;var fr=lang==="fr";var addToast=useToast();',
    'var DadacastSubpage=React.memo(function(_ref494){var _getAudienceCount2,_TIERS$find3,_TIERS$find4;var _ref494$conversations=_ref494.conversations,conversations=_ref494$conversations===void 0?[]:_ref494$conversations,_ref494$convTotalsMap=_ref494.convTotalsMap,convTotalsMap=_ref494$convTotalsMap===void 0?{}:_ref494$convTotalsMap,_ref494$models=_ref494.models,models=_ref494$models===void 0?[]:_ref494$models,lang=_ref494.lang,user=_ref494.user;var fr=lang==="fr";var DADACAST_MIN_SPACING_MS=45000,DADACAST_JITTER_MS=25000,DADACAST_SAFE_CHAT_IDS=function(ids){return ids.map(String).filter(function(id){return/^\\d{5,}$/.test(id)})};var addToast=useToast();',
)

src = replace_once(
    src,
    'var DadashMessagerieTab=React.memo(function(_ref524){var _scriptStates$_script,_scriptStates$_script2,_scriptStates$_script3,_scriptStates$_script4,_scriptStates$_script5,_scriptStates$_script6,_find54,_find55;var user=_ref524.user,lang=_ref524.lang,spenders=_ref524.spenders,models=_ref524.models,profiles=_ref524.profiles,txs=_ref524.txs,initialChatId=_ref524.initialChatId;var fr=lang==="fr";var addToast=useToast();',
    'var DadashMessagerieTab=React.memo(function(_ref524){var _scriptStates$_script,_scriptStates$_script2,_scriptStates$_script3,_scriptStates$_script4,_scriptStates$_script5,_scriptStates$_script6,_find54,_find55;var user=_ref524.user,lang=_ref524.lang,spenders=_ref524.spenders,models=_ref524.models,profiles=_ref524.profiles,txs=_ref524.txs,initialChatId=_ref524.initialChatId;var fr=lang==="fr";var DADACAST_MIN_SPACING_MS=45000,DADACAST_JITTER_MS=25000,DADACAST_SAFE_CHAT_IDS=function(ids){return ids.map(String).filter(function(id){return/^\\d{5,}$/.test(id)})};var addToast=useToast();',
)

src = replace_once(
    src,
    'var estMinutes=Math.max(1,Math.ceil(effectiveRecipients*3.5/60));',
    'var estMinutes=Math.max(1,Math.ceil(effectiveRecipients*(DADACAST_MIN_SPACING_MS+DADACAST_JITTER_MS/2)/60000));',
)

src = replace_exact_count(
    src,
    'setTimeout(r,2000+Math.random()*3000)',
    'setTimeout(r,DADACAST_MIN_SPACING_MS+Math.random()*DADACAST_JITTER_MS)',
    2,
)

src = replace_exact_count(
    src,
    'Array.from(selectedConvIds)',
    'DADACAST_SAFE_CHAT_IDS(Array.from(selectedConvIds))',
    3,
)

APP.write_text(src)

for path in (INDEX, SW):
    text = path.read_text()
    text = text.replace("dadash-app.compiled.js?v=fast7", "dadash-app.compiled.js?v=lea-safe1")
    path.write_text(text)

print("V1 Lea Dadacast throttle patched")
