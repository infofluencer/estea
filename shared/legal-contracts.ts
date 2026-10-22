/**
 * Ön bilgilendirme formu + mesafeli satış sözleşmesi metni — tek kaynak.
 *
 * ⚠ Es Çay: Metin Mareen'in (tekstil) hukukçu onaylı sözleşmesinden devralındı.
 * Çay = gıda ürünü → cayma hakkı istisnaları (ambalajı açılmış ürün vb.) için
 * hukukçu incelemesi şart (bkz. docs/ESCAY-KARARLAR.md K5). Onay tarihini
 * CONTRACT_TEXT_VERSION'a yaz.
 *
 * Kullananlar:
 * - storefront /legal/* sayfaları → `data` yok, alıcı/sipariş alanları
 *   "sipariş sırasında belirtilir" olarak basılır
 * - backend src/lib/order-contracts.ts → siparişin kendi bilgileriyle PDF
 *
 * Metin değişirse CONTRACT_TEXT_VERSION güncellenir (PDF'e ve sipariş
 * metadata'sına yazılır).
 */

export const CONTRACT_TEXT_VERSION = "2026-10-22-draft"

/**
 * Satıcı künyesi — storefront lib/company.ts ve backend src/emails/company.ts ile aynı.
 * Kaynak: market.esteacay.com/iletisim (landing content.ts). E-posta TODO(K8): resmi adres netleşince değiştir.
 */
export const CONTRACT_SELLER = {
  name: "Hamzalı Çay Gıda Tur. ve İnş. A.Ş. (Es Çay)",
  address: "Balaban Mah. Uğurlu Cad. No: 9, Merkez, Hayrat / Trabzon",
  phone: "0462 692 30 61",
  email: "info@esteacay.com",
} as const

export type ContractKind = "on-bilgilendirme-formu" | "mesafeli-satis-sozlesmesi"

export const CONTRACT_TITLES: Record<ContractKind, string> = {
  "on-bilgilendirme-formu": "Ön Bilgilendirme Formu",
  "mesafeli-satis-sozlesmesi": "Mesafeli Satış Sözleşmesi",
}

export type ContractPerson = {
  name: string
  address: string
  phone: string
  email: string
}

/** Siparişin kendi bilgileri (tutarlar biçimlenmiş metin). */
export type ContractOrderData = {
  orderNo: string
  /** Sipariş / onay tarihi, biçimlenmiş */
  date: string
  /** Teslimat (teslim alacak kişi) */
  recipient: ContractPerson
  /** Siparişi veren / fatura */
  billing: ContractPerson
  items: { name: string; quantity: number; total: string }[]
  totals: { label: string; value: string }[]
  paymentMethod: "card" | "bank_transfer"
}

export type ContractBlock =
  | { type: "p"; text: string }
  /** Alt alta satırlar (künye, tanımlar, alt maddeler) */
  | { type: "lines"; lines: string[] }
  /** Ürün tablosu + toplamlar (yalnız sipariş verisi varken) */
  | { type: "table"; rows: [string, string][]; totals: [string, string][] }

export type ContractSection = { heading: string; blocks: ContractBlock[] }

const ASK = "sipariş sırasında belirtilir"

function person(p: ContractPerson | undefined): ContractPerson {
  return {
    name: p?.name || ASK,
    address: p?.address || ASK,
    phone: p?.phone || ASK,
    email: p?.email || ASK,
  }
}

function productTable(d: ContractOrderData | null): ContractBlock[] {
  if (!d) return []
  return [
    {
      type: "table",
      rows: d.items.map((i) => [`${i.name} × ${i.quantity}`, i.total]),
      totals: d.totals.map((t) => [t.label, t.value]),
    },
  ]
}

export function mesafeliSatisSozlesmesi(d: ContractOrderData | null): ContractSection[] {
  const r = person(d?.recipient)
  const b = person(d?.billing ?? d?.recipient)
  return [
    {
      heading: "1. TARAFLAR",
      blocks: [
        { type: "p", text: "İşbu Sözleşme aşağıdaki taraflar arasında aşağıda belirtilen hüküm ve şartlar çerçevesinde imzalanmıştır." },
        { type: "p", text: `ALICI AD-SOYAD: ${b.name}` },
        { type: "p", text: `ALICI ADRES: ${b.address}` },
        { type: "p", text: `SATICI : ${CONTRACT_SELLER.name}` },
        { type: "p", text: `SATICI ADRES: ${CONTRACT_SELLER.address}` },
        {
          type: "p",
          text: "İş bu sözleşmeyi kabul etmekle ALICI, sözleşme konusu siparişi onayladığı takdirde sipariş konusu bedeli ve varsa kargo ücreti, vergi gibi belirtilen ek ücretleri ödeme yükümlülüğü altına gireceğini ve bu konuda bilgilendirildiğini peşinen kabul eder.",
        },
      ],
    },
    {
      heading: "2. TANIMLAR",
      blocks: [
        {
          type: "lines",
          lines: [
            "İşbu sözleşmenin uygulanmasında ve yorumlanmasında aşağıda yazılı terimler karşılarındaki yazılı açıklamaları ifade edeceklerdir.",
            "BAKAN: Gümrük ve Ticaret Bakanı’nı,",
            "BAKANLIK: Gümrük ve Ticaret Bakanlığı’nı,",
            "KANUN: 6502 sayılı Tüketicinin Korunması Hakkında Kanun’u,",
            "YÖNETMELİK: Mesafeli Sözleşmeler Yönetmeliği’ni,",
            "HİZMET: Bir ücret veya menfaat karşılığında yapılan ya da yapılması taahhüt edilen mal sağlama dışındaki her türlü tüketici işlemini,",
            "SATICI: Ticari veya mesleki faaliyetleri kapsamında tüketiciye mal sunan veya mal sunan adına veya hesabına hareket eden şirketi,",
            "ALICI: Bir mal veya hizmeti ticari veya mesleki olmayan amaçlarla edinen, kullanan veya yararlanan gerçek ya da tüzel kişiyi,",
            "SİTE: SATICI’ya ait internet sitesini,",
            "SİPARİŞ VEREN: Bir mal veya hizmeti SATICI’ya ait internet sitesi üzerinden talep eden gerçek ya da tüzel kişiyi,",
            "TARAFLAR: SATICI ve ALICI’yı,",
            "SÖZLEŞME: SATICI ve ALICI arasında akdedilen işbu sözleşmeyi,",
            "MAL: Alışverişe konu olan taşınır eşyayı ve elektronik ortamda kullanılmak üzere hazırlanan yazılım, ses, görüntü ve benzeri gayri maddi malları",
          ],
        },
      ],
    },
    {
      heading: "3. KONU",
      blocks: [
        {
          type: "lines",
          lines: [
            "İşbu Sözleşme, ALICI’nın, SATICI’ya ait internet sitesi üzerinden elektronik ortamda siparişini verdiği aşağıda nitelikleri ve satış fiyatı belirtilen ürünün satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmelere Dair Yönetmelik hükümleri gereğince tarafların hak ve yükümlülüklerini düzenler.",
            "Listelenen ve sitede ilan edilen fiyatlar satış fiyatıdır. İlan edilen fiyatlar ve vaatler güncelleme yapılana ve değiştirilene kadar geçerlidir. Süreli olarak ilan edilen fiyatlar ise belirtilen süre sonuna kadar geçerlidir.",
          ],
        },
      ],
    },
    {
      heading: "4. SATICI BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            `Ünvanı: ${CONTRACT_SELLER.name}`,
            CONTRACT_SELLER.address,
            `Telefon: ${CONTRACT_SELLER.phone}`,
            `Eposta: ${CONTRACT_SELLER.email}`,
          ],
        },
      ],
    },
    {
      heading: "5. ALICI BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            `Teslim edilecek kişi: ${r.name}`,
            `Teslimat Adresi: ${r.address}`,
            `Telefon: ${r.phone}`,
            `Eposta/kullanıcı adı: ${r.email}`,
          ],
        },
      ],
    },
    {
      heading: "6. SİPARİŞ VEREN KİŞİ BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            `Ad/Soyad/Unvan: ${b.name}`,
            `Adres: ${b.address}`,
            `Telefon: ${b.phone}`,
            `Eposta/kullanıcı adı: ${b.email}`,
          ],
        },
      ],
    },
    {
      heading: "7. SÖZLEŞME KONUSU ÜRÜN/ÜRÜNLER BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            "1. Malın/Ürün/Ürünlerin/Hizmetin temel özelliklerini (türü, miktarı, marka/modeli, rengi, adedi) SATICI’ya ait internet sitesinde yayınlanmaktadır. Satıcı tarafından kampanya düzenlenmiş ise ilgili ürünün temel özelliklerini kampanya süresince inceleyebilirsiniz. Kampanya tarihine kadar geçerlidir.",
            "7.2. Fiyatlar",
            "Listelenen ve sitede ilan edilen fiyatlar satış fiyatıdır. İlan edilen fiyatlar ve vaatler güncelleme yapılana ve değiştirilene kadar geçerlidir. Süreli olarak ilan edilen fiyatlar ise belirtilen süre sonuna kadar geçerlidir.",
            "7.3. Vergiler ve Ödemeler",
            "Sözleşme konusu mal ya da hizmetin tüm vergiler dâhil satış fiyatı aşağıda gösterilmiştir.",
          ],
        },
        ...productTable(d),
      ],
    },
    {
      heading: "8. FATURA BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            `Ad/Soyad/Unvan: ${b.name}`,
            `Adres: ${b.address}`,
            `Telefon: ${b.phone}`,
            `Eposta/kullanıcı adı: ${b.email}`,
            "Fatura teslim: Fatura sipariş teslimatı sırasında fatura adresine sipariş ile birlikte teslim edilecektir.",
          ],
        },
      ],
    },
    {
      heading: "9. GENEL HÜKÜMLER",
      blocks: [
        {
          type: "lines",
          lines: [
            "9.1. Bilgilendirme ve Kabul",
            "ALICI, SATICI’ya ait internet sitesinde sözleşme konusu ürünün temel nitelikleri, satış fiyatı ve ödeme şekli ile teslimata ilişkin ön bilgileri okuyup, bilgi sahibi olduğunu, elektronik ortamda gerekli teyidi verdiğini kabul, beyan ve taahhüt eder.",
            "9.2. Teslim Süresi",
            "Sözleşme konusu her bir ürün, 30 günlük yasal süreyi aşmamak kaydı ile ALICI’nın yerleşim yeri uzaklığına bağlı olarak internet sitesindeki ön bilgiler kısmında belirtilen süre zarfında teslim edilir.",
          ],
        },
      ],
    },
    {
      heading: "10. CAYMA HAKKI",
      blocks: [
        {
          type: "p",
          text: "ALICI, mesafeli sözleşmenin mal satışına ilişkin olması durumunda, ürünün kendisine veya gösterdiği adresteki kişi/kuruluşa teslim tarihinden itibaren 14 gün içerisinde, SATICI’ya bildirmek şartıyla hiçbir gerekçe göstermeksizin malı reddederek sözleşmeden cayma hakkını kullanabilir.",
        },
      ],
    },
    {
      heading: "11. CAYMA HAKKI KULLANILAMAYACAK ÜRÜNLER",
      blocks: [
        {
          type: "p",
          text: "ALICI’nın isteği veya açıkça kişisel ihtiyaçları doğrultusunda hazırlanan, iç giyim alt parçaları, makyaj malzemeleri, tek kullanımlık ürünler gibi ürünler cayma hakkı kapsamı dışında kalmaktadır.",
        },
      ],
    },
    {
      heading: "12. TEMERRÜT HALİ VE HUKUKİ SONUÇLARI",
      blocks: [
        {
          type: "p",
          text: "ALICI, ödeme işlemlerini kredi kartı ile yaptığı durumda temerrüde düştüğü takdirde, kart sahibi banka ile arasındaki kredi kartı sözleşmesi çerçevesinde faiz ödeyeceğini ve bankaya karşı sorumlu olacağını kabul, beyan ve taahhüt eder.",
        },
      ],
    },
    {
      heading: "13. YETKİLİ MAHKEME",
      blocks: [
        {
          type: "p",
          text: "İşbu sözleşmeden doğan uyuşmazlıklarda şikayet ve itirazlar, tüketicinin yerleşim yerinin bulunduğu veya tüketici işleminin yapıldığı yerdeki tüketici sorunları hakem heyetine veya tüketici mahkemesine yapılacaktır.",
        },
      ],
    },
    {
      heading: "14. YÜRÜRLÜK",
      blocks: [
        {
          type: "p",
          text: "ALICI, Site üzerinden verdiği siparişe ait ödemeyi gerçekleştirdiğinde işbu sözleşmenin tüm şartlarını kabul etmiş sayılır.",
        },
      ],
    },
  ]
}

export function onBilgilendirmeFormu(d: ContractOrderData | null): ContractSection[] {
  const r = person(d?.recipient)
  const b = person(d?.billing ?? d?.recipient)
  const payment = d
    ? d.paymentMethod === "bank_transfer"
      ? "Banka havalesi/EFT"
      : "Kredi Banka Kartı"
    : ASK
  return [
    {
      heading: "1.KONU",
      blocks: [
        {
          type: "p",
          text: "İşbu Satış Sözleşmesi Ön Bilgi Formu’nun konusu, SATICI' nın, SİPARİŞ VEREN/ALICI' ya satışını yaptığı, aşağıda nitelikleri ve satış fiyatı belirtilen ürün/ürünlerin satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicilerin Korunması Hakkındaki Kanun - Mesafeli Sözleşmeler Yönetmeliği (RG:27.11.2014/29188) hükümleri gereğince tarafların hak ve yükümlülüklerini kapsamaktadır. İş bu ön bilgilendirme formunu kabul etmekle ALICI, sözleşme konusu siparişi onayladığı takdirde sipariş konusu bedeli ve varsa kargo ücreti, vergi gibi belirtilen ek ücretleri ödeme yükümlülüğü altına gireceğini ve bu konuda bilgilendirildiğini peşinen kabul eder.",
        },
      ],
    },
    {
      heading: "2. SATICI BİLGİLERİ",
      blocks: [
        { type: "p", text: CONTRACT_SELLER.name },
        { type: "p", text: CONTRACT_SELLER.address },
        { type: "p", text: CONTRACT_SELLER.phone },
        { type: "p", text: CONTRACT_SELLER.email },
      ],
    },
    {
      heading: "3. ALICI BİLGİLERİ(Bundan sonra ALICI olarak anılacaktır.)",
      blocks: [
        { type: "p", text: r.name },
        { type: "p", text: r.address },
        { type: "p", text: r.phone },
        { type: "p", text: r.email },
      ],
    },
    {
      heading: "4. SÖZLEŞME KONUSU ÜRÜN/ÜRÜNLER BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            "4.1 Malın / Ürün/Ürünlerin / Hizmetin temel özellikleri (türü, miktarı, marka/modeli, rengi, adedi) SATICI’ya ait internet sitesinde yer almaktadır. Ürünün temel özelliklerini kampanya süresince inceleyebilirsiniz. Kampanya tarihine kadar geçerlidir.",
            "4.2 Listelenen ve sitede ilan edilen fiyatlar satış fiyatıdır. İlan edilen fiyatlar ve vaatler güncelleme yapılana ve değiştirilene kadar geçerlidir. Süreli olarak ilan edilen fiyatlar ise belirtilen süre sonuna kadar geçerlidir.",
            "4.3 Sözleşme konusu mal ya da hizmetin tüm vergiler dâhil satış fiyatı aşağıdaki tabloda gösterilmiştir.",
          ],
        },
        ...productTable(d),
        { type: "p", text: `Ödeme Şekli ve Planı : ${payment}` },
      ],
    },
    {
      heading: "5. GENEL HÜKÜMLER",
      blocks: [
        {
          type: "lines",
          lines: [
            "5.1. ALICI, SATICI’ya ait internet sitesinde sözleşme konusu ürünün temel nitelikleri, satış fiyatı ve ödeme şekli ile teslimata ilişkin ön bilgileri okuyup, bilgi sahibi olduğunu, elektronik ortamda gerekli teyidi verdiğini kabul, beyan ve taahhüt eder. ALICININ; Ön Bilgilendirmeyi elektronik ortamda teyit etmesi, mesafeli satış sözleşmesinin kurulmasından evvel, SATICI tarafından ALICI' ya verilmesi gereken adresi, siparişi verilen ürünlere ait temel özellikleri, ürünlerin vergiler dâhil fiyatını, ödeme ve teslimat bilgilerini de doğru ve eksiksiz olarak edindiğini kabul, beyan ve taahhüt eder.",
            "5.2. Sözleşme konusu her bir ürün, 30 günlük yasal süreyi aşmamak kaydı ile ALICI' nın yerleşim yeri uzaklığına bağlı olarak internet sitesindeki ön bilgiler kısmında belirtilen süre zarfında ALICI veya ALICI’ nın gösterdiği adresteki kişi ve/veya kuruluşa teslim edilir. Bu süre içinde ürünün ALICI’ya teslim edilememesi durumunda, ALICI’nın sözleşmeyi feshetme hakkı saklıdır.",
            "5.3. SATICI, sözleşme konusu ürünü eksiksiz, siparişte belirtilen niteliklere uygun ve varsa garanti belgeleri, kullanım kılavuzları ile teslim etmeyi, her türlü ayıptan arî olarak yasal mevzuat gereklerine sağlam, standartlara uygun bir şekilde işin gereği olan bilgi ve belgeler ile işi doğruluk ve dürüstlük esasları dâhilinde ifa etmeyi, hizmet kalitesini koruyup yükseltmeyi, işin ifası sırasında gerekli dikkat ve özeni göstermeyi, ihtiyat ve öngörü ile hareket etmeyi kabul, beyan ve taahhüt eder.",
            "5.4. SATICI, sözleşmeden doğan ifa yükümlülüğünün süresi dolmadan ALICI’yı bilgilendirmek ve açıkça onayını almak suretiyle eşit kalite ve fiyatta farklı bir ürün tedarik edebilir.",
            "5.5. SATICI, sipariş konusu ürün veya hizmetin yerine getirilmesinin imkânsızlaşması halinde sözleşme konusu yükümlülüklerini yerine getiremezse, bu durumu, öğrendiği tarihten itibaren 3 gün içinde yazılı olarak tüketiciye bildireceğini, 14 günlük süre içinde toplam bedeli ALICI’ya iade edeceğini kabul, beyan ve taahhüt eder.",
            "5.6. ALICI, sözleşme konusu ürünün teslimatı için işbu Ön Bilgilendirme Formunu elektronik ortamda teyit edeceğini, herhangi bir nedenle sözleşme konusu ürün bedelinin ödenmemesi ve/veya banka kayıtlarında iptal edilmesi halinde, SATICI’ nın sözleşme konusu ürünü teslim yükümlülüğünün sona ereceğini kabul, beyan ve taahhüt eder.",
            "5.7. ALICI, Sözleşme konusu ürünün ALICI veya ALICI’nın gösterdiği adresteki kişi ve/veya kuruluşa tesliminden sonra ALICI'ya ait kredi kartının yetkisiz kişilerce haksız kullanılması sonucunda sözleşme konusu ürün bedelinin ilgili banka veya finans kuruluşu tarafından SATICI'ya ödenmemesi halinde, ALICI Sözleşme konusu ürünü 3 gün içerisinde nakliye gideri SATICI’ya ait olacak şekilde SATICI’ya iade edeceğini kabul, beyan ve taahhüt eder.",
            "5.8. SATICI, tarafların iradesi dışında gelişen, önceden öngörülemeyen ve tarafların borçlarını yerine getirmesini engelleyici ve/veya geciktirici hallerin oluşması gibi mücbir sebepler halleri nedeni ile sözleşme konusu ürünü süresi içinde teslim edemez ise, durumu ALICI' ya bildireceğini kabul, beyan ve taahhüt eder. ALICI da siparişin iptal edilmesini, sözleşme konusu ürünün varsa emsali ile değiştirilmesini ve/veya teslimat süresinin engelleyici durumun ortadan kalkmasına kadar ertelenmesini SATICI’ dan talep etme hakkına haizdir. ALICI tarafından siparişin iptal edilmesi halinde ALICI’ nın nakit ile yaptığı ödemelerde, ürün tutarı 14 gün içinde kendisine nakden ve defaten ödenir. ALICI’ nın kredi kartı ile yaptığı ödemelerde ise, ürün tutarı, siparişin ALICI tarafından iptal edilmesinden sonra 14 gün içerisinde ilgili bankaya iade edilir. ALICI, SATICI tarafından kredi kartına iade edilen tutarın banka tarafından ALICI hesabına yansıtılmasına ilişkin ortalama sürecin 2 ile 3 haftayı bulabileceğini, bu tutarın bankaya iadesinden sonra ALICI’ nın hesaplarına yansıması halinin tamamen banka işlem süreci ile ilgili olduğundan, ALICI, olası gecikmeler için SATICI’ yı sorumlu tutamayacağını kabul, beyan ve taahhüt eder.",
          ],
        },
      ],
    },
    {
      heading: "6. FATURA BİLGİLERİ",
      blocks: [
        {
          type: "lines",
          lines: [
            `Ad/Soyad/Unvan : ${b.name}`,
            `Adres : ${b.address}`,
            `Telefon : ${b.phone}`,
            `Eposta/kullanıcı adı : ${b.email}`,
            "Fatura teslim : Fatura sipariş teslimatı sırasında fatura adresine sipariş ile birlikte teslim edilecektir.",
          ],
        },
      ],
    },
    {
      heading: "7. CAYMA HAKKI",
      blocks: [
        {
          type: "lines",
          lines: [
            "7.1. ALICI; mal satışına ilişkin mesafeli sözleşmelerde, ürünün kendisine veya gösterdiği adresteki kişi/kuruluşa teslim tarihinden itibaren 14 (on dört) gün içerisinde, SATICI’ya bildirmek şartıyla hiçbir hukuki ve cezai sorumluluk üstlenmeksizin ve hiçbir gerekçe göstermeksizin malı reddederek sözleşmeden cayma hakkını kullanabilir. Hizmet sunumuna ilişkin mesafeli sözleşmelerde ise, bu süre sözleşmenin imzalandığı tarihten itibaren başlar. Cayma hakkı süresi sona ermeden önce, tüketicinin onayı ile hizmetin ifasına başlanan hizmet sözleşmelerinde cayma hakkı kullanılamaz. Cayma hakkının kullanımından kaynaklanan masraflar SATICI’ ya aittir. ALICI, iş bu sözleşmeyi kabul etmekle, cayma hakkı konusunda bilgilendirildiğini peşinen kabul eder.",
            "7.2. Cayma hakkının kullanılması için 14 (ondört) günlük süre içinde SATICI' ya iadeli taahhütlü posta, faks veya eposta ile yazılı bildirimde bulunulması ve ürünün işbu sözleşmede düzenlenen düzenlenen \"Cayma Hakkı Kullanılamayacak Ürünler\" hükümleri çerçevesinde kullanılmamış olması şarttır. Bu hakkın kullanılması halinde,",
            "7.2.1 3. kişiye veya ALICI’ ya teslim edilen ürünün faturası, (İade edilmek istenen ürünün faturası kurumsal ise, geri iade ederken kurumun düzenlemiş olduğu iade faturası ile birlikte gönderilmesi gerekmektedir. Faturası kurumlar adına düzenlenen sipariş iadeleri İADE FATURASI kesilmediği takdirde tamamlanamayacaktır.)",
            "7.2.2. İade formu,",
            "7.2.3. İade edilecek ürünlerin kutusu, ambalajı, varsa standart aksesuarları ile birlikte eksiksiz ve hasarsız olarak teslim edilmesi gerekmektedir.",
            "7.2.4. SATICI, cayma bildiriminin kendisine ulaşmasından itibaren en geç 10 günlük süre içerisinde toplam bedeli ve ALICI’ yı borç altına sokan belgeleri ALICI’ ya iade etmek ve 20 günlük süre içerisinde malı iade almakla yükümlüdür.",
            "7.2.5. ALICI’ nın kusurundan kaynaklanan bir nedenle malın değerinde bir azalma olursa veya iade imkânsızlaşırsa ALICI kusuru oranında SATICI’ nın zararlarını tazmin etmekle yükümlüdür. Ancak cayma hakkı süresi içinde malın veya ürünün usulüne uygun kullanılmasın sebebiyle meydana gelen değişiklik ve bozulmalardan ALICI sorumlu değildir.",
            "7.2.6. Cayma hakkının kullanılması nedeniyle SATICI tarafından düzenlenen kampanya limit tutarının altına düşülmesi halinde kampanya kapsamında faydalanılan indirim miktarı iptal edilir.",
          ],
        },
      ],
    },
    {
      heading: "8. CAYMA HAKKI KULLANILAMAYACAK ÜRÜNLER",
      blocks: [
        {
          type: "lines",
          lines: [
            "8.1. a) Fiyatı finansal piyasalardaki dalgalanmalara bağlı olarak değişen ve satıcı veya sağlayıcının kontrolünde olmayan mal veya hizmetlere ilişkin sözleşmeler.",
            "b) Tüketicinin istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan mallara ilişkin sözleşmeler.",
            "c) Çabuk bozulabilen veya son kullanma tarihi geçebilecek malların teslimine ilişkin sözleşmeler.",
            "ç) Tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu unsurları açılmış olan mallardan; iadesi sağlık ve hijyen açısından uygun olmayanların teslimine ilişkin sözleşmeler.",
            "d) Tesliminden sonra başka ürünlerle karışan ve doğası gereği ayrıştırılması mümkün olmayan mallara ilişkin sözleşmeler.",
            "e) Malın tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu unsurları açılmış olması halinde maddi ortamda sunulan kitap, dijital içerik ve bilgisayar sarf malzemelerine, veri kaydedebilme ve veri depolama cihazlarına ilişkin sözleşmeler.",
            "f) Abonelik sözleşmesi kapsamında sağlananlar dışında, gazete ve dergi gibi süreli yayınların teslimine ilişkin sözleşmeler.",
            "g) Belirli bir tarihte veya dönemde yapılması gereken, konaklama, eşya taşıma, araba kiralama, yiyecek-içecek tedariki ve eğlence veya dinlenme amacıyla yapılan boş zamanın değerlendirilmesine ilişkin sözleşmeler.",
            "ğ) Elektronik ortamda anında ifa edilen hizmetler veya tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmeler.",
            "h) Cayma hakkı süresi sona ermeden önce, tüketicinin onayı ile ifasına başlanan hizmetlere ilişkin sözleşmeler.",
            "Kozmetik ve kişisel bakım ürünleri, iç giyim ürünleri, mayo, bikini, kitap, kopyalanabilir yazılım ve programlar, DVD, VCD, CD ve kasetler ile kırtasiye sarf malzemeleri (toner, kartuş, şerit vb.) iade edilebilmesi için ambalajlarının açılmamış, denenmemiş, bozulmamış ve kullanılmamış olmaları gerekir.",
            "8.2. SATICI şikâyet ve itirazları konusunda başvurularını, aşağıdaki kanunda belirtilen parasal sınırlar dâhilinde tüketicinin yerleşim yerinin bulunduğu veya tüketici işleminin yapıldığı yerdeki tüketici sorunları hakem heyetine veya tüketici mahkemesine yapabilir. Parasal sınıra ilişkin bilgiler aşağıdadır:",
            "28/05/2014 tarihinden itibaren geçerli olmak üzere:",
            "a) 6502 sayılı Tüketicinin Korunması Hakkında Kanun’un 68. Maddesi gereği değeri 2.000,00 (ikibin) TL’nin altında olan uyuşmazlıklarda ilçe tüketici hakem heyetlerine,",
            "b) Değeri 3.000,00(üçbin)TL’ nin altında bulunan uyuşmazlıklarda il tüketici hakem heyetlerine,",
            "c) Büyükşehir statüsünde bulunan illerde ise değeri 2.000,00 (ikibin) TL ile 3.000,00(üçbin)TL’ arasındaki uyuşmazlıklarda il tüketici hakem heyetlerine başvuru yapılmaktadır.",
            "İşbu Sözleşme ticari amaçlarla yapılmaktadır.",
          ],
        },
        ...(d
          ? [{ type: "lines" as const, lines: [`Satıcı : ${CONTRACT_SELLER.name}`, `Alıcı : ${r.name}`, `Tarih : ${d.date}`] }]
          : []),
      ],
    },
  ]
}

export function contractSections(kind: ContractKind, d: ContractOrderData | null): ContractSection[] {
  return kind === "mesafeli-satis-sozlesmesi" ? mesafeliSatisSozlesmesi(d) : onBilgilendirmeFormu(d)
}
