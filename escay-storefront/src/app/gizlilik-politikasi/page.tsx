import Link from "next/link"
import { LegalLayout } from "@/components/legal/LegalLayout"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "Gizlilik ve KVKK | Es Çay",
}

export default function GizlilikKvkkPage() {
  return (
    <LegalLayout title="Gizlilik ve KVKK">
      <h2>Gizlilik Politikası</h2>
      <p>
        Bu Gizlilik Politikası, {COMPANY.legalName}, {COMPANY.address}, Türkiye,
        e-posta: {COMPANY.emailOps}, telefon: {COMPANY.phone}
        ’ün, web sitemizi ({COMPANY.site}) kullandığınızda topladığımız
        bilgilerinizin toplanması, kullanımı ve ifşasına ilişkin politikalarını
        açıklamaktadır. Hizmete erişerek veya Hizmeti kullanarak, bu Gizlilik
        Politikasına uygun olarak bilgilerinizin toplanmasına, kullanılmasına ve
        ifşasına onay vermiş olursunuz. Eğer buna onay vermiyorsanız, lütfen
        Hizmete erişmeyin veya Hizmeti kullanmayın.
      </p>

      <h3>1. Topladığımız Bilgiler</h3>
      <p>Sizinle ilgili aşağıdaki kişisel bilgileri toplayacak ve işleyeceğiz:</p>
      <ul>
        <li>İsim</li>
        <li>E-posta</li>
        <li>Mobil</li>
        <li>Sosyal Medya Profili</li>
        <li>Doğum Tarihi</li>
        <li>Adres</li>
        <li>İş Adresi</li>
        <li>Ödeme Bilgileri</li>
        <li>TC Kimlik numarası, vergi numarası</li>
      </ul>

      <h3>2. Bilgilerinizi Nasıl Topluyoruz</h3>
      <ul>
        <li>
          Kullanıcı kayıt formunu doldurduğunda veya başka bir şekilde kişisel
          bilgilerini gönderdiğinde
        </li>
        <li>Web sitesiyle etkileşim kurar</li>
        <li>Kamu kaynaklarından</li>
      </ul>

      <h3>3. Bilgilerinizi Nasıl Kullanıyoruz</h3>
      <ul>
        <li>Pazarlama/Tanıtım</li>
        <li>Kullanıcı hesabı oluşturma</li>
        <li>Müşteri Yorumları</li>
        <li>Müşteri geri bildirimlerinin toplanması</li>
        <li>Şartlar ve Koşulları Uygula</li>
        <li>Destek</li>
        <li>Yönetim bilgileri</li>
        <li>Hedefli reklamcılık</li>
        <li>Müşteri siparişini yönetin</li>
        <li>Site koruması</li>
        <li>Kullanıcıdan kullanıcıya yorumlar</li>
        <li>Kullanıcı hesabını yönetin</li>
      </ul>
      <p>
        Bilgilerinizi başka bir amaçla kullanmak istersek, sizden onay isteyeceğiz
        ve onayınızı aldıktan sonra, kanunen aksi yönde hareket etmemiz
        gerekmedikçe, yalnızca onay verdiğiniz amaç(lar) için bilgilerinizi
        kullanacağız.
      </p>

      <h3>4. Bilgilerinizi Nasıl Paylaşıyoruz</h3>
      <p>
        Aşağıda belirtilen sınırlı durumlar dışında, izniniz olmadan kişisel
        bilgilerinizi hiçbir üçüncü tarafla paylaşmayacağız:
      </p>
      <ul>
        <li>Reklam hizmeti</li>
        <li>Pazarlama ajansları</li>
        <li>Analitik</li>
        <li>Veri toplama ve işleme</li>
      </ul>
      <p>
        Bu tür üçüncü taraflardan, kendilerine aktardığımız kişisel bilgileri
        yalnızca aktarılma amacına uygun olarak kullanmalarını ve söz konusu
        amacı yerine getirmek için gerekli olandan daha uzun süre saklamamalarını
        talep ediyoruz.
      </p>
      <p>
        Kişisel bilgilerinizi ayrıca aşağıdaki amaçlarla da ifşa edebiliriz: (1)
        geçerli yasa, yönetmelik, mahkeme kararı veya diğer yasal süreçlere
        uymak; (2) bu Gizlilik Politikası da dahil olmak üzere bizimle yaptığınız
        sözleşmeleri uygulamak; veya (3) Hizmeti kullanımınızın herhangi bir
        üçüncü taraf hakkını ihlal ettiğine dair iddialara yanıt vermek. Hizmet
        veya şirketimiz başka bir şirketle birleşirse veya devralınırsa,
        bilgileriniz yeni sahibine devredilen varlıklardan biri olacaktır.
      </p>

      <h3>5. Bilgilerinizin Saklanması</h3>
      <p>
        Kişisel bilgileriniz, kullanıcılar hesaplarını kapattıktan sonra 90 gün
        ile 2 yıl arasında veya bu Gizlilik Politikası&apos;nda ayrıntılı olarak
        belirtildiği gibi, toplama amaçlarını yerine getirmek için ihtiyaç
        duyduğumuz süre boyunca saklanacaktır. Geçerli yasalara uygun olarak
        kayıt tutma/raporlama veya yasal hakların uygulanması, dolandırıcılığın
        önlenmesi vb. gibi diğer meşru nedenlerle belirli bilgileri daha uzun
        süre saklamamız gerekebilir. Sizi (doğrudan veya dolaylı olarak)
        tanımlamayan anonim ve toplu bilgiler süresiz olarak saklanabilir.
      </p>

      <h3>6. Haklarınız</h3>
      <p>
        Geçerli yasalara bağlı olarak, kişisel verilerinize erişme, bunları
        düzeltme veya silme, kişisel verilerinizin bir kopyasını alma,
        verilerinizin aktif işlenmesini kısıtlama veya itiraz etme, kişisel
        bilgilerinizi başka bir kuruluşa aktarmamızı (taşımamızı) isteme,
        verilerinizin işlenmesi için bize verdiğiniz herhangi bir onayı geri
        çekme, yasal bir mercie şikayette bulunma ve geçerli yasalar uyarınca
        ilgili olabilecek diğer haklara sahip olabilirsiniz. Bu haklarınızı
        kullanmak için {COMPANY.emailOps} adresine yazabilirsiniz. Talebinize
        geçerli yasalara uygun olarak yanıt vereceğiz.
      </p>
      <p>
        Lütfen unutmayın ki, gerekli kişisel bilgilerin toplanmasına veya
        işlenmesine izin vermezseniz veya bu bilgilerin gerekli amaçlar için
        işlenmesine ilişkin rızanızı geri çekerseniz, bilgilerinizin istendiği
        hizmetlere erişemeyebilir veya bunları kullanamayabilirsiniz.
      </p>

      <h3>7. Cookies Etc.</h3>
      <p>
        Bu izleme teknolojilerini nasıl kullandığımız ve bunlarla ilgili
        seçenekleriniz hakkında daha fazla bilgi edinmek için lütfen{" "}
        <Link href="/cerez-politikasi">Çerez Politikamıza</Link> bakın.
      </p>

      <h3>8. Güvenlik</h3>
      <p>
        Bilgilerinizin güvenliği bizim için önemlidir ve kontrolümüz altındaki
        bilgilerinizin kaybolmasını, kötüye kullanılmasını veya yetkisiz olarak
        değiştirilmesini önlemek için makul güvenlik önlemleri alacağız. Bununla
        birlikte, doğasında var olan riskler göz önüne alındığında, mutlak
        güvenliği garanti edemeyiz ve sonuç olarak, bize ilettiğiniz herhangi bir
        bilginin güvenliğini sağlayamayız veya temin edemeyiz ve bunu kendi
        riskinizle yaparsınız.
      </p>
      <p>
        Site-Ziyaretçi Haberleşme Güvenliği: Sitemiz’in sipariş sayfalarında site
        ile ziyaretçi arasındaki haberleşme 128 bit SSL standartında
        gerçekleşmektedir. Kredi kartı bilgilerinin verileceği sayfada bu
        haberleşme biçiminin bulunup bulunmadığını, sayfaya erişildiğinde adres
        çubuğunda yazan ifadenin http://.. biçiminde değil, https://.. biçiminde
        oluşu ifade etmektedir.
      </p>
      <p>
        Site-Banka Haberleşme Güvenliği: Kredi kartı bilgilerinin siteden bankaya
        aktarılması kapsamında güvenlik, ilgili bankanın / ödeme kuruluşunun
        sunduğu maksimum güvenlik ile gerçekleşmektedir. CVV2/CVC2 kodu da çalıntı
        kart veya kart bilgileri ile alışverişe karşı önlem olarak kullanılmaktadır.
        Kredi kartı bilgileriniz yalnızca ödeme işlemi sırasında kullanılır ve
        veri tabanında kayıtlı olarak tutulmaz.
      </p>

      <h3>9. Üçüncü Taraf Bağlantıları</h3>
      <p>
        Hizmetimiz, bizim tarafımızdan işletilmeyen diğer web sitelerine
        bağlantılar içerebilir. Bu Gizlilik Politikası, herhangi bir üçüncü tarafın
        gizlilik politikasını ve diğer uygulamalarını kapsamaz. Ziyaret ettiğiniz
        her sitenin gizlilik politikasını incelemenizi şiddetle tavsiye ederiz.
      </p>

      <h3>10. Şikayet / Veri Koruma Sorumlusu</h3>
      <p>
        Bizimle olan bilgilerinizin işlenmesiyle ilgili herhangi bir sorunuz veya
        endişeniz varsa, lütfen şu adresten e-posta gönderin: {COMPANY.legalName},{" "}
        {COMPANY.address}, e-posta: {COMPANY.emailOps}. Endişelerinizi ilgili
        yasalara uygun olarak ele alacağız.
      </p>

      <h2>Aydınlatma Metni (KVKK)</h2>
      <p>
        {COMPANY.brand} (“{COMPANY.legalName}”), internet sitesini/mobil
        uygulamasını ziyaret eden kişilerin paylaşmış olduğu bilgilerin
        gizliliğini sağlamayı ilke olarak kabul etmiştir. İşbu “Aydınlatma Metni”
        kişilerin hangi bilgilerinin, hangi yollarla işlendiğini, bu bilgilerin
        hukuka uygun olarak ve vermiş olduğunuz izin kapsamında hangi üçüncü
        kişiler ile paylaşıldığını ve Şirket tarafından ne şekilde korunduğunu
        açıklayarak sizi bilgilendirmek amacı ile oluşturulmuştur.
      </p>
      <p>
        İşbu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu’nun
        (“KVKK veya Kanun”) 10’uncu Maddesi ile aydınlatma yükümlülüğün yerine
        getirilmesinde uyulacak usul ve esaslar hakkında tebliğ kapsamında veri
        sorumlusu olarak {COMPANY.brand} (“Şirket”) tarafından hazırlanmıştır.
      </p>

      <h3>1. Veri Sorumlusu</h3>
      <p>
        Şirket, kişisel verilerinizi KVKK başta olmak üzere kişisel verilerin
        korunmasına ilişkin tüm mevzuat hükümlerine uygun şekilde işlemekte,
        verilerinizin güvenli şekilde barındırılmasını sağlamakta ve olası hukuka
        aykırı erişimlere karşı gerekli tüm güvenlik tedbirlerini almaktadır.
      </p>

      <h3>2. Çocukların Gizliliği</h3>
      <p>
        İnternet sitemizde/mobil uygulamamızda 18 yaşının altındaki çocuklardan
        bilerek veri toplanmamaktadır. 18 yaşının altındaysanız lütfen Hizmetleri
        kullanarak herhangi bir kişisel verinizi paylaşmayınız.
      </p>

      <h3>3. Çerez Kullanımı</h3>
      <p>
        Şirket, anılan kişisel verilerden bazılarını teknik bir iletişim dosyasını
        (çerez) kullanarak elde edebilir. Ayrıntılar için{" "}
        <Link href="/cerez-politikasi">Çerez Politikası</Link> sayfasına
        bakınız.
      </p>

      <h3>4. Online Alışveriş İçin Gereken Veriler</h3>
      <p>
        Şirket, internet sitesi üzerinden yaptığınız ürün veya hizmet
        alışverişlerinde güvenliğinizi önemsemektedir. Bu nedenle kredi kartı
        bilgileriniz sadece sipariş işlemi gerçekleştirilirken kullanılır ve veri
        tabanında kayıtlı olarak tutulmaz. Ödeme PayTR güvenli ödeme altyapısı ile
        alınır.
      </p>

      <h3>5–7. Bağlantılar, Sosyal Medya, Güncelleme</h3>
      <p>
        Şirket internet sitesi üçüncü kişilere ait sitelere yönlendiren bağlantılar
        içerebilir; bu siteler için işbu metin geçerli değildir. Sosyal medya
        bağlantıları ilgili ağların gizlilik politikalarına tabidir. Şirket,
        işbu metnin içeriğini dilediği zaman değiştirebilir; güncel hali{" "}
        {COMPANY.site} adresinde yayınlanır.
      </p>

      <h3>8. İşlenen Kişisel Veri Kategorileri ve Amaçlar</h3>
      <p>
        Paylaşılan kişisel veriler; hizmet ve sözleşmenin ifası, ürün/hizmetlerin
        geliştirilmesi, hukuki uyuşmazlıklarda mevzuat gereği bilgi verilmesi,
        üyelere imkan sunulması ve 6698 sayılı KVKK ile ilgili ikincil düzenlemelere
        uygun olarak işlenecektir.
      </p>

      <h3>9. Veri Saklama Süresi</h3>
      <p>
        Üye olurken ya da ürün veya hizmet satın alırken doğrudan paylaşılan
        veriler üyelik süresinin ya da satış işlemlerinin devamı boyunca
        saklanmaktadır.
      </p>

      <h3>10–12. İşleme, Aktarım, Eski Veriler</h3>
      <p>
        KVKK uyarınca kişisel veriler otomatik veya otomatik olmayan yollarla
        işlenebilir. Aktarılabilecek alıcılar arasında hissedarlar, iş ortakları,
        altyapı sağlayıcıları, yurtiçi/yurtdışı işbirliği yapılan kuruluşlar ve
        resmi merciler yer alabilir. KVKK’nın yürürlük tarihi olan 07.04.2016
        tarihinden önce depolanan kişisel veri bulunmamaktadır.
      </p>

      <h3>13. Veri Sahibinin Hakları</h3>
      <p>
        Veri sahibi; düzeltme, silme, işlemeyi kısıtlama, şikayet, veri
        taşınabilirliği ve itiraz haklarını kullanabilir. Kanuni taleplerinizi
        kimliğinizi tevsik edici belgelerle {COMPANY.address} adresine veya{" "}
        {COMPANY.emailKvkk} adresine iletebilirsiniz. Kanun’un 13. Maddesi
        uyarınca en geç 30 gün içinde dönüş yapılır.
      </p>

      <h3>14. Sorumluluklarınız</h3>
      <p>
        Hesabınızın güvenliği için yeterince karmaşık parolalar kullanmanız ve
        cihazınızın güvenliğini sağlamanız sizin sorumluluğunuzdadır.
      </p>
    </LegalLayout>
  )
}
