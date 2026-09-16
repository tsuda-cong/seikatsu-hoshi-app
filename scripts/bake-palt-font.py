# 帳票PDF用のフォント(public/fonts/NotoSansJP-Palt-v1.ttf)を作るスクリプト。
# アプリには含まれない。フォントを作り直すときだけ使う。
#
#   python scripts/bake-palt-font.py <NotoSansJP-Regular.ttf> public/fonts/NotoSansJP-Palt-v2.ttf
#
# 元にしたのは Google Fonts の Noto Sans JP Regular(奉仕報告アプリの public/fonts にあるものと同じ)。
# 作り直したらファイル名の版を上げること。サービスワーカーがフォントを一度取ったら
# 使い回す設定なので、同じ名前のまま中身を変えると古いものが使われ続ける。
#
# 何をしているか: Noto Sans JP に、かな・句読点を詰めた字幅(OpenTypeの palt)を焼き込む。
# 以前の帳票はPCで游ゴシック UIを使っており、これはかなや句読点を詰めて並べる書体だった。
# Noto Sans JP をそのまま使うと文章が最大16%長くなり、1行だったものが折り返してしまう。
# pdf-lib は OpenType の機能を使わずに文字を並べるため、フォントの字幅そのものを書き換えておく。
#
# OFL(SIL Open Font License)では改変版の配布が認められている。予約名は「Source」だけで、
# ライセンスの記載(nameテーブルの13・14番)は残したままにする。
import sys
from fontTools.ttLib import TTFont

src, dst = sys.argv[1], sys.argv[2]
font = TTFont(src)
gpos = font['GPOS'].table
glyf = font['glyf']
hmtx = font['hmtx']

lookups = {i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == 'palt' for i in fr.Feature.LookupListIndex}
adjust = {}
for li in lookups:
    lookup = gpos.LookupList.Lookup[li]
    for st in lookup.SubTable:
        if lookup.LookupType == 9:
            st = st.ExtSubTable
        values = [st.Value] * len(st.Coverage.glyphs) if st.Format == 1 else st.Value
        for g, v in zip(st.Coverage.glyphs, values):
            adjust[g] = (getattr(v, 'XPlacement', 0) or 0, getattr(v, 'XAdvance', 0) or 0)

# 全角ピリオド(番号の「3．」)は、PCの帳票(游ゴシック UI)でも詰まっていない。
# 集会予定表はこの幅を基準に折り返した2行目の書き出しを揃えているので、字詰めから外す
cmap = font.getBestCmap()
for keep in ('．',):
    adjust.pop(cmap.get(ord(keep)), None)

for name, (dx, dadv) in adjust.items():
    advance, lsb = hmtx.metrics[name]
    glyph = glyf[name]
    if dx:
        if glyph.isComposite():
            for c in glyph.components:
                c.x += dx
        elif glyph.numberOfContours > 0:
            glyph.coordinates.translate((dx, 0))
        glyph.recalcBounds(glyf)
    new_lsb = glyph.xMin if hasattr(glyph, 'xMin') else lsb + dx
    hmtx.metrics[name] = (advance + dadv, new_lsb)

font.save(dst)
print(f'glyphs adjusted: {len(adjust)} -> {dst}')
