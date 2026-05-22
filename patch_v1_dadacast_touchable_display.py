#!/usr/bin/env python3
from pathlib import Path

APP = Path("dadash-app.compiled.js")
INDEX = Path("index.html")
SW = Path("sw.js")


def replace_once(source: str, old: str, new: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected 1 occurrence for {old[:120]!r}, found {count}")
    return source.replace(old, new, 1)


src = APP.read_text()

src = replace_once(
    src,
    'counts[t.id]=dbAllCount!==null&&dbAllCount!==void 0?dbAllCount:dadashAudiencePool.length;return',
    'counts[t.id]=selectedModelName&&String(selectedModelName).toLowerCase()==="lea"?dadashAudiencePool.length:dbAllCount!==null&&dbAllCount!==void 0?dbAllCount:dadashAudiencePool.length;return',
)

src = replace_once(
    src,
    'var selectedModel=models.find(function(m){return m.id===broadcastModel});var dbAudience=getAudienceCount(selectedModel===null||selectedModel===void 0?void 0:selectedModel.name);var effectiveRecipients=selectedTier==="all"&&dbAudience!=null?dbAudience:selectedConvIds.size;',
    'var selectedModel=models.find(function(m){return m.id===broadcastModel});var dbAudience=getAudienceCount(selectedModel===null||selectedModel===void 0?void 0:selectedModel.name);var isSelectedLea=!!(selectedModel&&selectedModel.name&&String(selectedModel.name).toLowerCase()==="lea");var effectiveRecipients=isSelectedLea?selectedConvIds.size:selectedTier==="all"&&dbAudience!=null?dbAudience:selectedConvIds.size;',
)

src = replace_once(
    src,
    '(_getAudienceCount2=getAudienceCount(selectedModel===null||selectedModel===void 0?void 0:selectedModel.name))!==null&&_getAudienceCount2!==void 0?_getAudienceCount2:dadashAudiencePool.length," fans',
    'isSelectedLea?dadashAudiencePool.length:(_getAudienceCount2=getAudienceCount(selectedModel===null||selectedModel===void 0?void 0:selectedModel.name))!==null&&_getAudienceCount2!==void 0?_getAudienceCount2:dadashAudiencePool.length," fans',
)

APP.write_text(src)

for path in (INDEX, SW):
    text = path.read_text()
    text = text.replace("dadash-app.compiled.js?v=lea-touch1", "dadash-app.compiled.js?v=lea-touch2")
    path.write_text(text)

print("V1 Dadacast Lea touchable display patched")
