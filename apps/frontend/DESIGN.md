---
name: Es Çay Mağaza
description: Esçay'ın kurumsal çevrim içi mağazası; beyaz zemin, kırmızı üst şerit, beyaz footer; vurguda ve satın almada logo kırmızısı.
colors:
  brand: "#c4161c"
  brand-dark: "#a10f14"
  shell: "#c4161c"
  shell-dark: "#a10f14"
  footer: "#ffffff"
  footer-bar: "#ffffff"
  accent-soft: "#fdeff0"
  gold: "#c8962e"
  gold-soft: "#faf3e3"
  ink: "#15181c"
  ink-soft: "#4b5258"
  muted: "#6b7278"
  line: "#e3e5e7"
  line-strong: "#cfd3d6"
  surface: "#f6f7f7"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.2vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 2.4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  item:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.975rem"
    fontWeight: 600
    lineHeight: 1.3
  price:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  body:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
rounded:
  thumb: "4px"
  control: "6px"
  card: "8px"
  round: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  gutter: "clamp(1rem, 3vw, 2.5rem)"
  section: "clamp(3rem, 6vw, 4.5rem)"
  page-max: "90rem"
components:
  button-buy:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
    typography: "{typography.item}"
  button-buy-hover:
    backgroundColor: "{colors.brand-dark}"
    textColor: "{colors.white}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-ink-hover:
    backgroundColor: "{colors.ink-soft}"
  button-shell:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-shell-hover:
    backgroundColor: "{colors.shell-dark}"
  button-info:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "48px"
  button-info-hover:
    backgroundColor: "{colors.accent-soft}"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 52px 0 16px"
    height: "46px"
  input-search-focus:
    backgroundColor: "{colors.white}"
  card-product:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip-size:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  chip-size-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.brand}"
  shell-strip:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.white}"
    height: "36px"
  footer:
    backgroundColor: "{colors.footer}"
    textColor: "{colors.ink-soft}"
  footer-bar:
    backgroundColor: "{colors.footer-bar}"
    textColor: "{colors.ink-soft}"
---

# Design System: Es Çay Mağaza

## Overview

**Creative North Star: "Fabrikanın Vitrini"**

Mağaza, büyük bir Türk gıda markasının kurumsal mağazası gibi davranır: beyaz zemin, tek bir dürüst yazı ailesi, ince gri çizgiler ve ürün paketinin kendisinin taşıdığı renk. Sayfanın tepesi logo kırmızısı bir şerittir (altında 2px altın çizgi); sayfanın dibi beyaz bir footer'dır (üstünde 3px kırmızı çizgi). Koyu kabuk bloğu yoktur; içerik beyazdır. Markanın tek vurgu rengi logo kırmızısıdır: dolgu olarak yalnız üst şeritte, arama düğmesinde ve satın alma eyleminde; çizgi ve metin olarak seçili ve aktif durumda görünür. Altın yalnız şeridin altındaki 2px çizgidir.

Yoğunluk orta-yüksektir; alışveriş görevi için kurulmuş bir ızgara, sabit satırlı ürün kartları ve her kartta görünür bir eylem. Dekor yoktur: doodle, krem zemin, pill buton, oyuncu başlık ve büyük harfli aralıklı etiket bu dünyada bulunmaz; bunlar landing'in dilidir ve mağaza onu bilerek reddeder. Kurumsal içerik (Hakkımızda, SSS, İletişim) landing'de yaşar; mağaza bu bağlantıları oraya yollar. Derinlik çizgiyle kurulur; gölge yalnız açılır katmanlarda ve hover tepkisinde belirir. Header sabit değildir, sayfayla birlikte kayar.

Dil yalnız Türkçedir. Fiyatlar tabular rakamla, "₺" önekli ve "–" ile aralık olarak yazılır.

**Key Characteristics:**
- Beyaz zemin, nötr mürekkep metin, 1px açık gri çizgilerle bölünmüş yüzeyler.
- Kırmızı üst şerit (altında 2px altın çizgi) ve beyaz footer (üstünde 3px kırmızı çizgi); koyu veya gri zeminli blok yok.
- Logo kırmızısı tek vurgu: dolgu yalnız şeritte, arama düğmesinde ve satın almada; çizgi/metin seçili durumda.
- Figtree Variable tek aile, 400–700; başlıklar 700 ve hafif negatif aralıklı.
- 6px kontrol, 8px kart köşesi; tam yuvarlak yalnız ikon diskleri ve rozetlerde.
- Gölge istisnadır: açılır menü, toast, çekmece, kart hover'ı ve yukarı çık butonu.

## Colors

Beyaz ve soğuk nötrler üzerinde tek vurgu olarak logo kırmızısı; footer da sayfa gibi beyazdır.

### Primary
- **Logo Kırmızısı** (brand): İki rolü vardır. Dolgu olarak yalnız satın alma: "Sepete ekle", hero'daki ürün/kategori butonları, toast'taki "Sepete git", sepet sayı rozeti. Vurgu olarak çizgi, metin ve işaret: aktif kategori metni ve alt çizgisi, sepet adım noktası, metin seçimi, seçili gramaj çipi ve küçük resim çerçevesi, "Tümünü gör" bağlantıları, kategori kartı hover çerçevesi ve adı, güvence tikleri, hizmet ikonları, sepet güvence panelinin üst çizgisi, footer'ın 3px üst çizgisi, sosyal ikon hover'ı, odak halkası, aktif favori kalbi. Hover'da ve hata metninde **Koyu Kırmızı** (brand-dark).
- **Kırmızı Sis** (accent-soft): Seçili durumların dolgusu: gramaj çipi, görünüm geçişinin aktif düğmesi, mobil çekmecedeki telefon kutusu, beyaz bilgi butonunun hover'ı.

### Secondary
- **Şerit Kırmızısı** (shell, değeri logo kırmızısı): Kabuk rolündeki kırmızı: üst iletişim şeridinin zemini (beyaz metin), arama gönder butonu, kategori menüsünün alt çizgisi, sepet adım noktaları, metin seçimi, kırmızı yardımcı buton. **Koyu Şerit** (shell-dark) bunların hover'ıdır. Ayrı token olarak durur ki kabuk rolü birincil eylemden bağımsız okunabilsin.
- **Footer Zemini** (footer, footer-bar): İkisi de beyazdır; footer ayrı bir ton taşımaz, sayfadan yalnız 3px kırmızı üst çizgiyle, yasal şerit de 1px kıl çizgiyle ayrılır. Token'lar footer rolünü adlandırmak için ayrı durur.

### Tertiary
- **Logo Altını** (gold): Tek görevi üst şeridin altındaki 2px çizgidir. Buton, zemin veya ikon rengi olarak kullanılmaz. **Altın Sisi** (gold-soft) yalnız "az kaldı" stok etiketinin zeminidir.

### Neutral
- **Mürekkep** (ink): Gövde metni, başlıklar, fiyat; koyu ikincil buton dolgusu; form alanı odak çerçevesi; hero fotoğrafı yüklenmeden önceki zemin.
- **Yumuşak Mürekkep** (ink-soft): Açıklama metni, ürün hikâyesi, güvence listesi, kurumsal menü bağlantıları.
- **Sis Grisi** (muted): Yer tutucu, seçenek sayısı, gramaj alt satırı, breadcrumb, eski fiyat.
- **Kıl Çizgi** (line): Kart çerçevesi, bölüm ayırıcı, header alt çizgisi, görsel ile künye arasındaki çizgi.
- **Belirgin Çizgi** (line-strong): Arama kutusu, ghost buton, gramaj çipi ve yukarı çık butonu çerçevesi; kart hover çerçevesi; breadcrumb ayıracı.
- **Yüzey** (surface): Arama kutusu zemini, ikon buton hover'ı, "Tükendi" durumunun zemini.
- **Beyaz** (white): Sayfa, kart ve ürün görseli zemini; footer ve yasal şerit zemini, footer sosyal disklerinin zemini; hero fotoğrafı üzerinde bilgi butonu.

### Named Rules
**The Kırmızı Dolgu Rule.** Kırmızı dolgu yalnız üç yerde durur: üst şerit, arama düğmesi ve satın almaya giden eylem. Satın alma olmayan bir hedefe giden buton (ör. "Bizi tanıyın") fotoğraf üzerinde beyaz, açık zeminde outline veya mürekkeptir. Seçili ve aktif durumlar kırmızıyı dolgu olarak değil, çizgi, metin ve kırmızı sis olarak taşır.

**The Tek Altın Çizgi Rule.** Altın, şeridin altındaki 2px çizgidir ve başka yerde görünmez.

**The Kırmızı Şerit, Beyaz Footer Rule.** Sayfa üstte kırmızı şeritle açılır ve altta beyaz footer'la kapanır; ikisi de birer logo rengiyle mühürlenir (şeridin altında altın, footer'ın üstünde kırmızı çizgi). Koyu ya da gri zeminli kabuk bloğu (yeşil, antrasit, gri) kullanılmaz; footer dahil her şey beyaz zemindedir.

## Typography

**Display Font:** Figtree Variable (ui-sans-serif, system-ui yedeğiyle)
**Body Font:** Figtree Variable
**Label/Mono Font:** ayrı aile yok

**Character:** Tek bir geometrik-insancıl grotesk, ağırlıkla hiyerarşi kurar: başlık 700, ürün adı ve eylem 600, gövde 400. Kurumsal, okunur, gösterişsiz.

### Hierarchy
- **Display** (700, clamp 2rem–3.5rem, 1.08): Yalnız hero slayt başlığı; en fazla 16ch genişlikte.
- **Headline** (700, clamp 1.6rem–2.25rem, 1.15): Ürün sayfası başlığı ve sayfa düzeyi başlıklar. Kategori sayfası başlığı aynı ailede daha büyüktür (clamp 2.2rem–3.6rem, 1.12).
- **Title** (700, clamp 1.5rem–2rem, 1.15): Bölüm başlıkları ("Benzer ürünler", ana sayfa şeritleri); en fazla iki satır.
- **Item** (600, 0.975rem, 1.3): Kart ürün adı (iki satıra kırpılır, iki satırlık yer ayırır), kategori menüsü (0.95rem), akordeon başlığı, buton metni.
- **Price** (700, 1.125rem kartta, 1.75rem ürün sayfasında, tabular rakam): Fiyat ve fiyat aralığı.
- **Body** (400, 1rem, 1.5; uzun metin 1.7): Gövde ve ürün hikâyesi; açıklama metni yumuşak mürekkepte.
- **Label** (600, 0.8125rem, aralıksız, düz yazım): Şerit metni, form etiketi, stok etiketi, footer iletişim başlıkları.

### Named Rules
**The Düz Yazım Rule.** Büyük harf ve harf aralıklı etiket yoktur; etiketler cümle düzeninde, 0.8125rem ve 600 ağırlıktadır. Başlıklarda harf aralığı yalnız negatiftir (-0.02em ile -0.025em).

**The Tabular Fiyat Rule.** Fiyat, telefon ve sayaç her zaman tabular rakamla yazılır ki kart ızgarasında hizalı dursun.

## Layout

İçerik en fazla 90rem genişliğe ortalanır ve yanlarda akışkan boşluk (gutter) bırakılır; şerit, header menüsü, hero ve footer zemini ekran kenarına kadar uzanır, içerikleri ise aynı 90rem çizgisine hizalanır.

- **Header** üç kattır ve sayfayla birlikte kayar (yapışkan değildir): 36px kırmızı şerit, beyaz metinli (sol not, sağda telefon, sipariş takibi, iletişim), 84px beyaz ana satır (solda logo, ortada en fazla 44rem genişlikte arama, sağda etiketli Giriş/Favoriler/Sepet ikonları), altında kategori menüsü (solda kategoriler, sağda Hakkımızda / SSS / İletişim; bunlar landing'e gider ve 1180px altında gizlenir).
- **Ürün ızgarası** mobilde 2, 720px üstünde 3, 1024px üstünde 4 sütun; kartlar arası 16px.
- **Ana sayfa** sırası: hero slider, kategori kartları, kategori başına ürün şeridi ("Tümünü gör" bağlantılı başlık satırıyla), dört sütunlu hizmet satırı, footer. Bölüm dikey boşluğu clamp(3rem, 6vw, 4.5rem); ardışık bölümler kıl çizgiyle ayrılır.
- **Ürün sayfası** 900px üstünde iki sütundur: solda galeri (1.2fr), sağda yapışkan satın alma paneli (1fr, üstten 1.5rem). Üstte breadcrumb, altta tam genişlik çizgiyle ayrılmış hikâye + akordeon detay bölümü, en altta benzer ürünler.
- **Mobil** (720px altı): kategori kartları ve ürün şeritleri yatay kaydırılan, snap'li şeritlere dönüşür; hero sekmeleri yalnız ilerleme çubuğu olur, oklar gizlenir; header menüsü çekmeceye taşınır.

**The Sabit Satır Rule.** Izgaradaki kartlar aynı yüksekliktedir: ad iki satır yer tutar, fiyat satırı alta itilir, eylem her zaman en altta görünür.

## Elevation & Depth

Sistem düzdür; yüzeyler 1px çizgiyle ayrılır. Gölge yalnız zeminden kopan katmanlarda (arama sonuçları, sepete eklendi toast'ı, mobil çekmece, yukarı çık butonu) ve etkileşim tepkisinde (kart hover) kullanılır. Hepsi mürekkep tonlu, negatif yayılımlı ve yumuşaktır; sert ofsetli gölge yoktur.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 12px 32px -8px rgb(21 24 28 / 0.18), 0 2px 6px rgb(21 24 28 / 0.06)`): Açılır katmanlar: arama sonuçları, toast, çekmece.
- **Kart hover** (`box-shadow: 0 10px 24px -14px rgb(21 24 28 / 0.28)`): Ürün ve kategori kartı hover'ı; çerçeve rengiyle birlikte değişir.
- **Yüzen kontrol** (`box-shadow: 0 6px 16px -8px rgb(21 24 28 / 0.25)`): Sabit konumlu yukarı çık butonu.
- **Odak halkası** (`box-shadow: 0 0 0 3px rgb(21 24 28 / 0.1)`): Form alanı odağı, mürekkep çerçeveyle birlikte; renksizdir.

### Named Rules
**The Çizgi Önce Rule.** Dinlenme halindeki hiçbir içerik yüzeyi gölge taşımaz; ayrım kıl çizgiyle kurulur, gölge yalnız katman veya tepki içindir.

## Shapes

Köşeler sakin ve küçüktür: kontroller (buton, arama, gramaj çipi, ok, ikon butonu, yukarı çık) 6px; kartlar, galeri çerçevesi ve açılır paneller 8px; küçük küçük resimler, arama gönder butonu ve stok etiketi 4px. Tam yuvarlak yalnız dairesel ikon butonlarında (kart favori kalbi, footer sosyal ikonları) ve sepet sayı rozetinde kullanılır. Ürün görselleri beyaz kare alan içinde `contain` ile yerleşir ve `multiply` karışımıyla beyaz zemine oturur; kenar boşluğu kartta %8, kategori kartında %12'dir.

Güvence listesindeki işaret, ikon fontu veya emoji değil, CSS ile çizilmiş kırmızı bir tiktir.

## Components

### Buttons
Kurumsal ve kararlı: düz yazım, 600 ağırlık, 6px köşe, renk geçişi 150ms.
- **Shape:** 6px köşe; 48px yükseklik (ürün sayfasında 52px, kartta 44px).
- **Primary (satın alma):** Logo kırmızısı dolgu, beyaz metin; hover'da koyu kırmızı. Kartta "Sepete ekle", ürün sayfasında tam genişlik "Sepete ekle", hero'da ürün veya kategoriye giden buton.
- **Bilgi (fotoğraf üzerinde):** Beyaz dolgu, mürekkep metin; hover'da kırmızı sis. Satın alma olmayan hedefler için (hero'da "Bizi tanıyın").
- **Koyu:** Mürekkep dolgu, hover'da yumuşak mürekkep; ikincil eylemdir. Promosyon kodu "Uygula" gibi ödeme akışındaki yardımcı düğmeler de bu mürekkep dolguyu kullanır; kırmızı dolgu yalnız satın almaya ayrılır.
- **Outline:** Beyaz zemin, belirgin çizgi çerçeve, mürekkep metin; hover'da çerçeve mürekkebe döner. Fotoğraf üzerinde beyaz yarı saydam çerçeve, hover'da beyaz dolgu.
- **Hover / Focus:** Renk geçişi; odakta 2px kırmızı halka, 2–3px ofset. Basılınca 1px aşağı.
- **Disabled / bekleme:** %60–70 opaklık, `wait` imleci, metin "Ekleniyor…".
- **Yukarı çık:** 44px beyaz kare, 6px köşe, belirgin çizgi çerçeve, yüzen kontrol gölgesi; hover'da çerçeve ve ok kırmızı.

### Chips
- **Gramaj çipi:** 44px yükseklik, en az 5rem genişlik, beyaz zemin, belirgin çizgi çerçeve, 600 ağırlık metin. Hover'da mürekkep çerçeve. Seçili: 2px kırmızı çerçeve, kırmızı sis zemin, kırmızı metin.
- **Görünüm geçişi:** Kategori sayfasında ızgara yoğunluğu düğmeleri; aktif olan kırmızı sis zeminde kırmızı ikon.
- **Stok etiketi:** Görselin sol üstünde 4px köşeli küçük etiket; "az kaldı" altın sisi zemin üzerinde koyu altın, kritik durumda açık kırmızı zemin üzerinde koyu kırmızı.

### Cards / Containers
- **Ürün kartı:** 8px köşe, beyaz zemin, kıl çizgi çerçeve. Üstte beyaz kare görsel (hover'da hafif büyür veya ikinci açı görünür), sağ üstte dairesel favori butonu. Görselin altında kıl çizgi, sonra künye: ad (iki satır), gramaj veya "N seçenek", fiyat ya da fiyat aralığı ("₺190,00 – ₺1.600,00"), indirimde üstü çizili eski fiyat. En altta her zaman görünür eylem: tek seçenekli ürün için kırmızı "Sepete ekle", çok gramajlı ürün için outline "Gramaj seç", tükenen için gri "Tükendi". İç boşluk 16px.
- **Kategori kartı:** Aynı çerçeve dili; kare ürün görseli, altında kıl çizgi, kategori adı (700) ve ürün sayısı. Hover'da çerçeve ve ad kırmızıya döner.
- **Shadow Strategy:** Dinlenmede yok; hover'da Kart hover gölgesi.

### Inputs / Fields
- **Arama:** 46px yükseklik, yüzey zemin, belirgin çizgi çerçeve, 6px köşe; sağ içte 38px kırmızı kare gönder butonu (hover'da koyu kırmızı) (4px köşe). Hover'da çerçeve yumuşak mürekkebe koyulaşır.
- **Focus:** Zemin beyaz, renksiz 3px odak halkası. Form alanlarında (giriş, hesap, ödeme, filtre) çerçeve mürekkebe döner.
- **Sonuç paneli:** 8px köşeli, Pop gölgeli beyaz panel; satırda 48px küçük resim, ad ve tabular fiyat.

### Navigation
- **Kategori menüsü:** 0.95rem, 600 ağırlık; hover ve aktif sayfada metin kırmızı olur ve altında 2px kırmızı çizgi soldan açılır. Sağdaki kurumsal bağlantılar 0.875rem, yumuşak mürekkep, landing'e gider.
- **Aksiyon ikonları:** İkon üstte, 0.8125rem etiket altta; hover'da yüzey zemin; sepet sayısı kırmızı yuvarlak rozet.
- **Breadcrumb:** 0.875rem, sis grisi; ayıraç belirgin çizgi renginde "/", geçerli sayfa mürekkep, hover kırmızı.
- **Sepet adımları:** Pasif nokta belirgin çizgi, aktif ve tamamlanan nokta kırmızı; etiket aktifken mürekkep ve 600.
- **Mobil:** Hamburger ile soldan açılan beyaz çekmece, Pop gölgeli; büyük (1.05rem, 600) bağlantılar ve kırmızı sis zeminli, kırmızı metinli telefon kutusu.

### Hero Slider
Tam genişlik bahçe/fabrika fotoğrafı; masaüstünde clamp(30rem, 74vh, 46rem), 720px ve altında min(37rem, 80svh) yüksekliğinde; fotoğraf yüklenmeden mürekkep zemin görünür. Slayt sırası: İlk Hasat (ürün sayfasına, kırmızı buton), Fabrikamız (landing'deki Hakkımızda'ya, beyaz bilgi butonu), Bahçelerimiz (Siyah Çay kategorisine), Tüm ürünler (ürün listesine). Perde nötr siyah tonludur ve iki katmandır: yalnız sol yarıyı koyulaştıran yatay geçiş (%55'te tamamen saydam) ve altta kısa bir dikey geçiş (%22); mobilde metin alttan okunsun diye tek, alttan yükselen bir perdeye döner. Solda başlık (en fazla 16ch), kısa açıklama ve tek buton. Altta sekmeler: her sekme slayt adı ve altında 2px ilerleme çubuğu; aktif sekmenin çubuğu slayt süresince soldan dolar, hover/odakta durur. Sağ altta 44px, 6px köşeli, yarı saydam çerçeveli oklar. Slaytlar 0.9s ile çapraz geçer, fotoğraf 7s boyunca hafifçe yakınlaşır, metin kademeli yükselir; azaltılmış harekette yakınlaşma ve ilerleme dolgusu kapanır.

### Güvence Listesi
Ürün sayfasında sepete ekle butonunun altında, kıl çizgiyle ayrılmış, kırmızı tikli üç satır: üretim yeri, güvenli ödeme, müşteri hizmetleri telefonu (koyu ve kalın). Sepette aynı fikir, üstü 2px kırmızı çizgili, kart olmayan çizgili listedir.

### Footer
Beyaz zemin, üstünde 3px kırmızı çizgi; metin yumuşak mürekkep, başlıklar ve iletişim değerleri mürekkep, bağlantılar hover'da kırmızı. Üst satır: logo doğrudan zeminde (kutu yok), sağında yatay iletişim bilgileri (Müşteri hizmetleri, E-posta, Fabrika) belirgin çizgi renginde 1px dikey çizgilerle ayrılır; telefon büyük ve tabular. Bu satır kıl çizgiyle kapanır. Orta ızgara: kısa tanım metni + Ürünler / Kurumsal / Yardım sütunları; Kurumsal sütunu landing'e gider ("Kurumsal site", Hakkımızda, SSS, İletişim). Alt yasal şerit de beyazdır ve üstten 1px kıl çizgiyle ayrılır; sözleşme bağlantıları ve beyaz, kıl çizgili dairesel sosyal ikonlar (hover'da kırmızıya dolar). 1024px altında üst satır alt alta dizilir, 720px altında iletişim dikey listeye döner.

## Do's and Don'ts

### Do:
- **Do** satın alma eylemini kırmızı dolguyla, satın alma olmayan eylemi beyaz, mürekkep veya outline ile ver.
- **Do** seçili ve aktif durumları kırmızı çizgi, kırmızı metin ve kırmızı sis ile işaretle.
- **Do** her ürün kartında eylemi görünür tut; çok gramajlı üründe "Gramaj seç", tek seçenekte "Sepete ekle".
- **Do** fiyat aralığını en düşük – en yüksek olarak, tabular rakamla yaz.
- **Do** yüzeyleri 1px kıl çizgiyle (line) ayır; kontrol çerçevelerinde belirgin çizgiyi (line-strong) kullan.
- **Do** kontrollerde 6px, kartlarda 8px köşe kullan.
- **Do** ürün görsellerini beyaz kare alanda `contain` ve `multiply` ile yerleştir.
- **Do** Hakkımızda, SSS ve İletişim bağlantılarını landing'e yönlendir.
- **Do** tüm metni Türkçe ve cümle düzeninde yaz.

### Don't:
- **Don't** büyük harfli, harf aralıklı etiket veya başlık üstü "kicker" kullanma.
- **Don't** Figtree dışında bir aile ekleme; landing'in Bricolage Grotesque, Archivo veya el yazısı yüzlerini mağazaya taşıma.
- **Don't** pill buton, krem zemin, doodle veya landing'in oyuncu başlık dilini kullanma.
- **Don't** altını buton, ikon veya zemin dolgusu yapma; altın şeridin altındaki tek çizgidir.
- **Don't** kırmızı dolguyu gezinme, bilgi veya dekor eylemi için kullanma.
- **Don't** koyu veya gri zeminli kabuk, bant veya footer kullanma (yeşil, antrasit ve gri reddedildi); koyu ton yalnız hero fotoğrafının perdesindedir.
- **Don't** dinlenme halindeki kartlara gölge verme; sert ofsetli gölge hiç kullanma.
- **Don't** ikon fontu veya emoji ile işaret koyma; ikonlar satır içi SVG, tikler CSS'tir.
