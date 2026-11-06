/**
 * Blog yazıları. Metinler esteacay.com'un 2020–2021 yazılarından (Wayback
 * arşivi; canlı site bu adreslerde artık ana sayfayı veriyor). Yazım hataları
 * düzeltildi, cümleler olduğu gibi; rakip marka adı tek yazıdan çıkarıldı.
 * Sırada en yeni başta. Arşivde yazı görselleri yok; kareler public/blog ve public/yolculuk'tan.
 */
import type { TeaSlug } from './shelf'

export type PostBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ol' | 'ul'; items: readonly string[] }

export type Post = {
  slug: string
  title: string
  /** ISO tarih, sıralama için. */
  date: string
  dateLabel: string
  image: string
  /** Telefon kırpımı, varsa. */
  imageMobile?: string
  alt: string
  /** Listede ve meta açıklamasında görünen tek cümle. */
  excerpt: string
  /** Yazının çayı: blogdaki süzgeç ve yazı sayfasındaki paket buradan gelir. */
  teas: readonly { slug: TeaSlug; why: string }[]
  body: readonly PostBlock[]
}

export const blogPage = {
  title: 'Çay üzerine',
  lead: 'Karadeniz çayı, demleme ve harmanlar üzerine Esçay’ın yazıları.',
  more: 'Diğer yazılar',
  back: 'Tüm yazılar',
  /** Çay süzgeci. */
  pick: 'Çayınızı seçin, yazılar ona göre süzülsün.',
  all: 'Bütün çaylar',
  listTitle: 'Bütün yazılar',
  teaTitle: (name: string) => `${name} ile okunacak yazılar`,
  teaCta: (name: string) => `${name} mağazada`,
  side: 'Bu yazının çayı',
  closeTitle: 'Sıra demlemede.',
  closeLead: 'Yazılarda andığımız çayların hepsi mağazada; dökme harmanlar, süzen poşet ve bitki çayları.',
  closeCta: 'Mağazaya git',
}

export const posts: Post[] = [
  {
    slug: 'sutlu-cay-nedir-nasil-yapilir',
    title: 'Sütlü çay nedir, nasıl yapılır?',
    date: '2021-11-30',
    dateLabel: '30 Kasım 2021',
    image: '/blog/sutlu-cay-nedir.jpg',
    alt: 'Fincanda sütlü çay',
    excerpt: 'Çaya süt katmak 17. yüzyılda Avrupa’da yayıldı; demin üstüne azar azar süt, hafif kahverengi tona gelince durun.',
    teas: [{ slug: 'ilk-hasat', why: 'Süt yoğun demi sever; koyu içenlerin sabah çayı.' }],
    body: [
      { type: 'p', text: 'Sütlü çay 17. yüzyılda Avrupa’da yaygınlaşmış bir çay türüdür. Çaya süt katmak zamanla İngilizler tarafından benimsenmiştir. Yıllar içinde İngiliz sömürgesinden ayrılan Hindistan, Singapur gibi ülkeler de sütlü çayı benimsemeye başlamıştır.' },
      { type: 'h2', text: 'Sütlü çay nasıl yapılır?' },
      { type: 'p', text: 'Sütlü çay, klasik çay lezzetine alternatif arayanlar için iyi bir seçim olmaya devam ediyor. Demlenmiş çaya dilediğiniz kadar süt ekleyerek kolayca sütlü çay yapabilirsiniz.' },
      { type: 'p', text: 'Fincanınıza dilediğiniz kadar dem koyun, ardından kaynar su ekleyin; damak tadınıza göre bardağın tamamını doldurmadan bir iki parmak boşluk bırakın. Sütü yavaş yavaş ekleyin; miktarını zevkinize göre artırıp azaltabilirsiniz. Çayınızı poşet çayla yapıyorsanız, üç dört dakika demlendikten sonra poşeti çıkarıp sütü öyle ekleyin.' },
      { type: 'h3', text: 'Sütlü çayın püf noktası' },
      { type: 'p', text: 'Püf noktası tabii ki süt. Süt, çayın tadını zenginleştirmek için kullanılır; bu yüzden miktarını çok artırmamak önemlidir. Çok süt çayın tadını bozar. Karıştırdığınızda hafif kahverengi bir ton yakaladıysanız doğru miktarı bulmuşsunuzdur.' },
      { type: 'h3', text: 'Çaya süt eklemenin faydaları' },
      { type: 'ul', items: ['İçimi hafif ve kolaydır.', 'Kan akışını düzenlemeye yardımcı olur.', 'Strese karşı koruyucu etkisi vardır.', 'Antioksidanlarıyla enfeksiyon önleyici etkisi vardır.', 'Metabolizmayı hızlandırır.', 'Kemik sağlığına faydalıdır.'] },
    ],
  },
  {
    slug: 'poset-cay-ne-zaman-bulundu',
    title: 'Poşet çay ne zaman bulundu?',
    date: '2021-11-23',
    dateLabel: '23 Kasım 2021',
    image: '/blog/suzen-poset.jpg',
    alt: 'Süzen poşetler, ince belli bardakta çay ve demlik poşet kutusu',
    excerpt: 'İlk patent 1896’da alındı; 1904’te New York’ta ipek keselerle gönderilen numuneler poşet çayı yaygınlaştırdı.',
    teas: [{ slug: 'demlik-poset', why: 'Poşetin demliğe uyarlanmış hâli, ilk hasat yaprağından.' }],
    body: [
      { type: 'p', text: 'Poşet çaylar hayatımızı kolaylaştıran, bir yandan da hızlı ve pratik çay demleme keyfi sunan bir buluştur. Çay her toplumda farklı bir yer edinmiş, her zaman çok sevilen bir içecek olmuştur. Peki dökme çaydan sonra poşet çay ne zaman bulundu?' },
      { type: 'h2', text: 'Poşet çay' },
      { type: 'p', text: 'Çay günlük hayatta çok tüketildiği için daha pratik ve kısa sürede hazırlanan yöntemler arandı. Poşet çay kolay taşınmasının yanında kısa sürede demlenmesiyle çokça tercih edilir.' },
      { type: 'p', text: 'Poşet çayın patenti ilk kez 1896’da A. V. Smith tarafından alındı. İngilizler çayı geleneksel yöntemle demlemeyi savunduğu için Smith’in buluşu başarısız sayıldı.' },
      { type: 'p', text: 'Sekiz yıl sonra, 1904’te New York’ta bir kahve tüccarı olan Thomas Sullivan çay ticaretine girdi. İşleri iyi gitmeyince tasarruf için çay numunelerini müşterilerine ipek keseler içinde göndermeye başladı. Müşteriler keseyi kesip çayı dökmek yerine keseyi olduğu gibi suya attı ve çayı ipek kesede istemeye başladı.' },
      { type: 'p', text: 'ABD’de çok sevilen poşet çay hızla yayıldı; 1930’da ipeğin maliyeti artınca kese kâğıda dönüştü. İngiltere’ye gelişi yaklaşık elli yıl sonra oldu ve geldiği andan itibaren sıkça kullanılmaya başlandı.' },
      { type: 'p', text: 'Esçay’ın süzen poşet çayları da Karadeniz’in yüksek rakımlı bahçelerinden toplanan aynı yapraktan işlenir.' },
    ],
  },
  {
    slug: 'siyah-cay-demlemenin-puf-noktalari',
    title: 'Siyah çay demlemenin püf noktaları',
    date: '2021-11-16',
    dateLabel: '16 Kasım 2021',
    image: '/blog/earl-grey-cay-nedir.jpg',
    alt: 'Buharı tüten bir bardak siyah çay',
    excerpt: 'Kaliteli yaprak, kokusuz saklama, porselen ya da cam demlik ve taze içme suyu: iyi demin dört şartı.',
    teas: [{ slug: 'karadeniz', why: 'Gün boyu demlikte durmaya alışkın evin çayı.' }],
    body: [
      { type: 'p', text: 'Siyah çay demlemek ülkemizde en önemli konulardan biridir. Sabah kahvaltısıyla başlayan çay gün boyu devam eder. Çay iyi demlenmediğinde tadı bozulur, istenmeyen bir lezzet ortaya çıkar. Bu yüzden demlemenin birkaç püf noktası vardır.' },
      { type: 'h2', text: 'Nelere dikkat etmeli?' },
      { type: 'h3', text: 'Kaliteli çay kullanın' },
      { type: 'p', text: 'Kullandığınız çay kaliteli değilse lezzetli bir çay demlemeniz pek mümkün olmaz.' },
      { type: 'h3', text: 'Çayı uygun koşullarda saklayın' },
      { type: 'p', text: 'Çayınızın kalitesini korumak için hava almayan cam kaplarda, nemden ve kokudan uzakta saklayın.' },
      { type: 'h3', text: 'İyi bir demlik kullanın' },
      { type: 'p', text: 'Ülkemizde çay demlemek için genellikle metal demlik kullanılır. Porselen ya da cam demlik çayı daha lezzetli kılar.' },
      { type: 'h3', text: 'İçme suyu kullanın' },
      { type: 'p', text: 'Çay demlerken kullandığınız suyun niteliği çayın lezzetiyle doğru orantılıdır. Musluk suyundaki klor çayın lezzetini düşürür.' },
      { type: 'h3', text: 'Bekletilmiş ya da yeniden kaynatılmış su kullanmayın' },
      { type: 'p', text: 'Bekletilmiş ya da kaynatılıp soğutulmuş suyun oksijeni azalır, mineraller etkisini yitirir; böyle suyla demlenen çayın lezzeti bozulur.' },
    ],
  },
  {
    slug: 'siyah-cay-hakkinda-10-ilginc-bilgi',
    title: 'Siyah çay hakkında on ilginç bilgi',
    date: '2021-11-04',
    dateLabel: '4 Kasım 2021',
    image: '/yolculuk/topla-1.jpg',
    imageMobile: '/yolculuk/topla-1-k.jpg',
    alt: 'Karadeniz bahçelerinde çay hasadı',
    excerpt: 'Hasat edilmeyen çay on altı metrelik ağaç olur; Türkiye’de çayı 1924’te Karadeniz’de Zihni Derin yetiştirdi.',
    teas: [{ slug: 'karadeniz', why: 'Yazıda andığımız, kışı kar altında geçen bahçelerin çayı.' }],
    body: [
      { type: 'p', text: 'Siyah çay Türkiye’de en çok tüketilen çay çeşididir. Lezzetli, yoğun kıvamlı çayı günün her anında içmeye bayılırız. Çay tiryakilerinin bile bilmediği on bilgi:' },
      {
        type: 'ol',
        items: [
          'Çay bitkisi hasat edilmediğinde büyümeye devam eder ve on altı metrelik bir çay ağacına dönüşür.',
          'Dünyada sudan sonra en çok tüketilen içecek çaydır; yeşil çayın payı yalnızca yüzde üçtür.',
          'Çayın babası sayılan Zihni Derin 1924’te Karadeniz’de çay üretimini başardı. Daha önce Türkiye’de çay üretilmiyordu.',
          'Doğu toplumları yaklaşık beş bin yıldır çay içiyor; Avrupalılar dört yüz yıldır.',
          'Çay bardağının ince belli olmasının başlıca nedeni, sıcak çayın eli yakmadan tutulabilmesidir.',
          'Türkiye’de yetişen çayın bu kadar lezzetli olmasının en önemli nedeni kışın kar altında kalmasıdır. Kar yaprağa doğal bir aroma verir ve onu korur.',
          'Şekersiz çay sıfır kaloridir; besin değeri açısından zengin olmasa da potasyum kaynağıdır.',
          'Çay bir antioksidan kaynağıdır.',
          'Beş bin yıl öncesine kadar çay yaprağı hastalıkları tedavi etmek için çiğnenerek kullanılıyordu.',
          'Çayın en çok üretildiği ülkeler arasında Çin, Hindistan, Sri Lanka ve Türkiye vardır.',
        ],
      },
      { type: 'p', text: 'Kışın kar altında kalan yüksek rakımlı bahçelerden topladığımız Karadeniz’in gerçek çayını siz de deneyin.' },
    ],
  },
  {
    slug: 'en-iyi-cay-demleme-10-altin-kural',
    title: 'En iyi çay demlemenin on altın kuralı',
    date: '2020-03-31',
    dateLabel: '31 Mart 2020',
    image: '/yolculuk/demle-1.jpg',
    imageMobile: '/yolculuk/demle-1-k.jpg',
    alt: 'Tezgâhta ince belli bardakta tavşan kanı çay',
    excerpt: 'Yaprak çay, kaynamadan hemen önce alınan taze su, ısıtılmış demlik ve metal olmayan kap: iyi fincanın on kuralı.',
    teas: [{ slug: 'gold', why: 'İlk kural yaprak çay: elekten çıkan ilk parti, hafif ve tatlı.' }],
    body: [
      { type: 'p', text: 'Sıcak çayın tatlı aroması bütün duyuları uyandırır. Çay severler hem sağlıklı hem yatıştırıcı olan bu içeceği iyi demlemek ister. Kendinize ve misafirlerinize en iyi fincanı hazırlamak için çay ustası olmanız gerekmez; şu birkaç ipucu çayı hazırlama biçiminizi değiştirecek.' },
      {
        type: 'ol',
        items: [
          'Çay poşeti pratik görünebilir; yaprak çayla demlediğinizde yeni ve benzersiz bir tat yaşarsınız. Çayın bir fincan kahve kadar zengin ve hoş kokulu olabileceğini göreceksiniz.',
          'Çoğu kişi suyun fokurdamasını bekleyip çayın üstüne kaynamış su döker. Bu sıcaklık bazı yaprakların lezzetini ve yararını öldürür. Suyu kaynamadan hemen önce, küçük kabarcıklar çıkarken alın.',
          'Yaprağın üstüne fazla su dökülürse tat kaybolur. Fincan boyuna uygun ölçüde çay kullanın; suyu önce bardaklara, sonra ısıtıcıya dökerek ihtiyacınız olan miktarı ölçebilirsiniz. Her zaman temiz su kullanın; bayat su tadı ve aromayı değiştirir.',
          'Taze ve soğuk su kullanın. Soğumuş suyu yeniden kaynatmayın.',
          'Demlenmiş çayı porselen çaydanlığa boşaltmadan önce bir kez karıştırın.',
          'Lezzetin açığa çıkması için çayı üç beş dakika demleyin.',
          'Demliği, çaydanlığı ve bardakları deterjanla yıkamayın.',
          'Metal demlik kullanmayın; metal çaydanlıkta yapılan çayda metal tadı olur.',
          'Yeşil çay altlıksız fincanla, siyah çay altlıklı fincanla sunulur.',
          'Daha iyi bir demleme ısısına ulaşmak için demliği önceden ısıtın.',
        ],
      },
    ],
  },
  {
    slug: 'en-iyi-cay-harmani-nasil-yapilir',
    title: 'En iyi çay harmanı nasıl yapılır?',
    date: '2020-03-31',
    dateLabel: '31 Mart 2020',
    image: '/yolculuk/denetle-avuc.jpg',
    imageMobile: '/yolculuk/denetle-avuc-k.jpg',
    alt: 'Avuçta dört boy kuru çay yaprağı',
    excerpt: 'Bir paket Gold’u büyük bir kaba boşaltın, bergamotlu Earl Grey’i azar azar katıp karıştırın; harman homojen olsun.',
    teas: [
      { slug: 'gold', why: 'Tarifin tabanı: büyük kaba önce bir paket Gold.' },
      { slug: 'earl-grey', why: 'Azar azar katılan bergamotlu yarısı.' },
    ],
    body: [
      { type: 'p', text: 'Çay içmeyi seremoni ya da ritüel gibi seven çok müdavim vardır. Bize göre bu, iyi bir harman ya da karışımla çok özel ve güzel hâle gelir.' },
      { type: 'p', text: 'Siyah çayı harmanlarken en çok tercih ettiğimiz, damak zevkimize de en uygun yöntem Earl Grey ile karıştırmaktır. Böylece bergamot yağının güzelliğini, tatlılığını, kokusunu ve burukluğunu hissedersiniz; aroması da rahatsız edecek kadar baskın olmaz.' },
      { type: 'p', text: 'Büyükçe bir kap alıp içine bir paket Esçay Gold’u boşaltın. Sonra siyah çaya renk ve tat vermesi için bergamotlu bir Earl Grey ekleyin. Earl Grey’i azar azar koyup karıştırın; hepsini bir anda eklerseniz karışım yeterince homojen olmaz.' },
      { type: 'p', text: 'Güzel kokulu, aromalı, rengi ve parlaklığıyla göze de hitap eden bir çay içmenin yolu iyi bir harmandan geçer.' },
    ],
  },
  {
    slug: 'cay-hakkinda-ilginc-bilgiler',
    title: 'Çay hakkında kendisi kadar keyifli bilgiler',
    date: '2020-01-25',
    dateLabel: '25 Ocak 2020',
    image: '/blog/dokme-cayin-puf-noktalari.jpg',
    alt: 'Sıra sıra çay bahçesi',
    excerpt: 'Bizim siyah dediğimiz çay Çinliler için kırmızıdır; kişi başı tüketimde Türkiye yılda üç buçuk kiloyla ilk sırada.',
    teas: [{ slug: 'tiryaki', why: 'Yılda üç buçuk kilo içen bir ülkenin aroması en yoğun harmanı.' }],
    body: [
      { type: 'p', text: 'Çay içmek ata sporlarımızdan biridir. Yanında çekirdek çitlemek gibi sevdiğimiz başka etkinlikler de vardır. Uzun dost sohbetlerinde üzerine konuşabileceğiniz birkaç ilginç bilgi:' },
      {
        type: 'ol',
        items: [
          'Bizim siyah çay dediğimiz Çinliler için kırmızı çaydır. Biz çayın kuru hâlini adlandırırız, onlar demlenmiş hâlini.',
          'Dünyanın en pahalı çay servisi Hong Kong’daki Ritz-Carlton otelinde yapılır; kişi başı yaklaşık dokuz bin dolardır.',
          'Suyun ardından dünyada en çok tüketilen ikinci içecek çaydır. Yıllık kişi başı tüketimde Türkiye üç buçuk kilogramla ilk sıradadır.',
          'Poşet çay 1904’te ABD’de bulundu; o dönemde kimileri bunu saçma ve boş bir icat saydı.',
          'Bir rivayete göre çay içmeye İmparator Shen Nung ile başlandı. Milattan önce 2717’de ateşin önünde su ısıtırken rüzgârla ağaçtan düşen birkaç yaprak suya karıştı.',
          'Dünyanın en pahalı çayı Çin’de Da Hong Pao bitkisinden yapılır; bir demliği on bin dolara mal olur.',
          'İngilizlerin beş çayı, Bedford Düşesi Anna Maria’nın uzun yemek aralarında bastıramadığı açlığından doğdu.',
        ],
      },
    ],
  },
]

export const postBySlug = (slug: string) => posts.find((p) => p.slug === slug)
