# Es Çay Postgres otomatik yedekleme

VPS (Dokploy) üzerinde çalışan Postgres container’ından `pg_dump` alır, gzip’ler, yerel `backups/` dizinine yazar ve projenin mevcut S3 ayarlarıyla `database-backups/` altına yükler.

## Dosyalar

| Dosya | Görev |
|-------|--------|
| `scripts/backup-db.sh` | Dump + gzip + S3 + rotasyon |
| `scripts/restore-db.sh` | Yerel veya S3 yedekten geri yükleme (onaylı) |
| `scripts/README-backup.md` | Bu doküman |

## Ortam değişkenleri

Mevcut Medusa / file-module isimleri kullanılır (`apps/backend/.env` veya `BACKUP_ENV_FILE`):

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `DATABASE_URL` | evet | `postgres://USER:PASS@HOST:5432/DB` — user/pass/db buradan alınır |
| `S3_BUCKET` | S3 için | Bucket adı |
| `S3_ACCESS_KEY_ID` | S3 için | Access key |
| `S3_SECRET_ACCESS_KEY` | S3 için | Secret |
| `S3_REGION` | hayır | Varsayılan `eu-north-1` |
| `S3_ENDPOINT` | hayır | R2 / özel endpoint varsa |
| `BACKUP_POSTGRES_CONTAINER` | hayır | Container ID/adı; yoksa `name=escay-postgres` ile bulunur |
| `BACKUP_DIR` | hayır | Varsayılan: `apps/backend/backups` |
| `BACKUP_S3_PREFIX` | hayır | Varsayılan: `database-backups` |
| `BACKUP_RETENTION_DAYS` | hayır | Varsayılan: `7` |
| `BACKUP_ENV_FILE` | hayır | Varsayılan: `../.env` (script’e göre) |

Secret hardcode yoktur. S3 bilgisi yoksa yerel yedek yine yazılır; upload atlanır / hata loglanır.

## Kurulum (Dokploy VPS)

```bash
# 1) Repoyu sunucuda güncelleyin (veya script dosyalarını kopyalayın)
cd /etc/dokploy/applications/escay-backend-yttqd4/code/apps/backend   # yol ortama göre değişir

chmod +x scripts/backup-db.sh scripts/restore-db.sh

# 2) Backend .env içinde DATABASE_URL + S3_* olduğundan emin olun
#    (Dokploy Environment → container’a basılan değerlerle aynı)

# 3) aws CLI isteğe bağlı — yoksa script amazon/aws-cli Docker imajını kullanır
```

`backups/` dizinini git’e eklemeyin (ör. kök `.gitignore`’a `apps/backend/backups/`).

## Manuel test

```bash
cd /path/to/apps/backend
./scripts/backup-db.sh
ls -lh backups/escay-*.sql.gz

# S3 doğrulama (host’ta aws varsa)
aws s3 ls "s3://${S3_BUCKET}/database-backups/" --region "$S3_REGION"
# veya Docker:
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION="$S3_REGION" \
  amazon/aws-cli:2.15.0 \
  s3 ls "s3://${S3_BUCKET}/database-backups/"
```

Beklenen: `escay-YYYYMMDD-HHMMSS.sql.gz` hem yerelde hem S3’te.

## Crontab (her gün 03:00 sunucu saati)

Root veya deploy kullanıcısı crontab’ı:

```cron
0 3 * * * cd /etc/dokploy/applications/escay-backend-yttqd4/code/apps/backend && /usr/bin/env bash ./scripts/backup-db.sh >>/var/log/escay-db-backup.log 2>&1
```

Yolu kendi Dokploy uygulama dizinine göre düzeltin. İlk kurulumda:

```bash
sudo touch /var/log/escay-db-backup.log
sudo chmod 644 /var/log/escay-db-backup.log
crontab -e   # satırı ekle
```

Dokploy **Schedules** UI kullanıyorsanız aynı komutu oraya da yazabilirsiniz (container içinde değil, **host** üzerinde docker erişimi olan bir job olmalı).

## Geri yükleme

**Dikkat:** Üzerine yazar (`DROP SCHEMA public CASCADE`). Önce yeni bir yedek alın.

```bash
# En son yerel yedek
./scripts/restore-db.sh

# Belirli yerel dosya
./scripts/restore-db.sh backups/escay-20260906-030001.sql.gz

# S3 key (bucket = S3_BUCKET)
./scripts/restore-db.sh database-backups/escay-20260906-030001.sql.gz

# Tam S3 URI
./scripts/restore-db.sh s3://escay-urunler-s3/database-backups/escay-20260906-030001.sql.gz
```

Script sırasıyla veritabanı adını ve `YES` yazmanızı ister.

Restore sonrası Medusa’yı yeniden başlatın (Dokploy’da backend redeploy / swarm service update).

## Rotasyon

- Yerel: `find … -mtime +N -delete` (`BACKUP_RETENTION_DAYS`, varsayılan 7)
- S3: aynı yaştan eski `database-backups/escay-*.sql.gz` silinir  
S3 silme başarısız olsa bile yedek alma işlemi yerel dosyayı korur; upload fail ise exit code ≠ 0.

## Sorun giderme

| Belirti | Kontrol |
|---------|---------|
| `postgres container not found` | `docker ps \| grep escay-postgres` → `BACKUP_POSTGRES_CONTAINER=<id>` |
| `pg_dump failed` / auth | `DATABASE_URL` user/pass, container içi `POSTGRES_USER` ile uyumlu mu? |
| S3 upload fail, yerel var | Credential / region / bucket; `S3_ENDPOINT` R2 için gerekli mi? |
| Cron sessiz | Log: `/var/log/escay-db-backup.log`; path ve `chmod +x` |

## Güvenlik

- Dump içinde müşteri/sipariş verisi vardır — S3 bucket private kalsın (ürün görselleri bucket’ı public ise ayrı private bucket önerilir).
- Script çıktısına şifre basılmaz.
- Restore onayları atlanamaz.
