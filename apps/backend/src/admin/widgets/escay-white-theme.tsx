import { defineWidgetConfig } from "@medusajs/admin-sdk"
// Font pakette gelir: personel IP'si Google'a gitmez, CSP/ağ engeli fontu düşürmez.
import "@fontsource/figtree/400.css"
import "@fontsource/figtree/500.css"
import "@fontsource/figtree/600.css"
import "@fontsource/figtree/700.css"

/**
 * Panelin küresel görünümü: aydınlık temada beyaz zemin, ince kenarlıklı kartlar.
 *
 * Tema seçimi (Profil menüsü → Tema: Sistem / Aydınlık / Karanlık) Medusa'nındır
 * ve korunur. Beyaz renkler yalnız aydınlık temada (`.dark` yokken) geçerlidir;
 * karanlıkta Medusa'nın kendi koyu değişkenleri çalışır. Hiç seçim yapılmamışsa
 * panel aydınlık açılır (Medusa varsayılanı "Sistem" koyu Mac'te koyu açardı).
 *
 * Widget modülleri admin açılışında statik yüklenir, bu yüzden tema çizilen
 * bölgeden bağımsız olarak her sayfada geçerlidir (bkz. stale-chunk-reload).
 *
 * Yazı tipi ve yerleşim düzeltmeleri iki temada da geçerlidir; Medusa'nın iç
 * sınıf zincirlerine dayanır, liste ve güncelleme testi: lib/theme-anchors.ts.
 */
const STYLE_ID = "escay-white-theme"
const THEME_KEY = "medusa_admin_theme"

const CSS = `
html:root:not(.dark) {
  color-scheme: light;

  --bg-base: #ffffff;
  --bg-base-hover: #f6f7f8;
  --bg-base-pressed: #eeeff1;
  --bg-subtle: #ffffff;
  --bg-subtle-hover: #f6f7f8;
  --bg-subtle-pressed: #eeeff1;
  --bg-component: #ffffff;
  --bg-component-hover: #f6f7f8;
  --bg-component-pressed: #eeeff1;
  --bg-field: #ffffff;
  --bg-field-hover: #f9fafa;
  --bg-field-component: #ffffff;
  --bg-field-component-hover: #f9fafa;
  --bg-highlight: #f1f4f9;
  --bg-highlight-hover: #e8edf5;
  --bg-interactive: #1d5fbf;
  --bg-disabled: #f3f4f5;
  --bg-overlay: rgba(31, 35, 40, 0.32);

  --fg-base: #1f2328;
  --fg-subtle: #5b6168;
  --fg-muted: #6b7077;
  --fg-disabled: #a4a8ae;
  --fg-interactive: #1d5fbf;
  --fg-interactive-hover: #174d9c;
  --fg-on-color: #ffffff;
  --fg-on-inverted: #ffffff;

  --border-base: #ececee;
  --border-strong: #dcdfe3;
  --border-transparent: rgba(255, 255, 255, 0);
  --border-menu-top: #ececee;
  --border-menu-bot: #ffffff;
  --border-interactive: #1d5fbf;

  --button-neutral: #ffffff;
  --button-neutral-hover: #f6f7f8;
  --button-neutral-pressed: #eeeff1;
  --button-inverted: #1f2328;
  --button-inverted-hover: #32373d;
  --button-inverted-pressed: #41474e;
  --button-transparent: rgba(255, 255, 255, 0);
  --button-transparent-hover: #f6f7f8;
  --button-transparent-pressed: #eeeff1;

  --elevation-card-rest: 0 0 0 1px #ececee;
  --elevation-card-hover: 0 0 0 1px #dcdfe3;
  --borders-base: 0 0 0 1px #dcdfe3;
  --buttons-neutral: 0 0 0 1px #dcdfe3;
  --buttons-inverted: 0 0 0 1px #1f2328;
}

html:not(.dark), html:not(.dark) body { background: #ffffff; }

html .font-sans, html body {
  font-family: Figtree, Inter, ui-sans-serif, system-ui, sans-serif;
}

/* 13 px uzun oturumda yorar. */
html .txt-compact-small, html .txt-compact-small-plus, html .txt-small, html .txt-small-plus {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

html td, html th { font-variant-numeric: tabular-nums; }

/* Düğmeler dar sütunlarda alt satıra kaymasın. */
html button.txt-compact-small-plus, html a.txt-compact-small-plus[class*="shadow-buttons"] {
  font-size: 0.8125rem;
}

/* Sipariş satırı: adet + durum etiketi sütunu tutara yapışmasın. */
html main .grid-cols-2.items-center.px-6 > .grid-cols-3.items-center.gap-x-4 {
  grid-template-columns: minmax(0, 1fr) 150px minmax(0, 1fr);
  column-gap: 12px;
}

/* Kartlar */
html .shadow-elevation-card-rest.rounded-lg { border-radius: 14px; }

/* Sayfa kenar boşlukları */
html main > .max-w-\\[1600px\\] {
  padding: 24px;
  row-gap: 16px;
}
@media (max-width: 640px) {
  html main > .max-w-\\[1600px\\] { padding: 16px; }
}

/* Kenar çubuğu: etkin satır nötr gri, satırlar rahat aralıklı */
html aside a {
  padding-top: 6px;
  padding-bottom: 6px;
}
html aside a.shadow-elevation-card-rest,
html aside a.shadow-elevation-card-rest:hover {
  background: var(--bg-base-pressed);
  box-shadow: none;
}
/* Eklenti sayfalarının ikonlarındaki kutu, Medusa'nın kendi ikonlarıyla aynı görünsün. */
html aside a .shadow-borders-base {
  background: transparent;
  box-shadow: none;
}
`

if (typeof document !== "undefined") {
  try {
    // ThemeProvider ilk çizimde okur; modül ondan önce yüklenir. Yalnız seçim
    // hiç yapılmamışsa yazılır — kullanıcının seçimi ezilmez.
    if (!localStorage.getItem(THEME_KEY)) localStorage.setItem(THEME_KEY, "light")
  } catch {
    // Depolama kapalı: Medusa "Sistem"e düşer.
  }

  const style =
    (document.getElementById(STYLE_ID) as HTMLStyleElement | null) ??
    document.head.appendChild(Object.assign(document.createElement("style"), { id: STYLE_ID }))
  style.textContent = CSS
}

const EscayWhiteTheme = () => null

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default EscayWhiteTheme
