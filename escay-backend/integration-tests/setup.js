const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

// Testler aynı IP'den çok sayıda iade isteği atar — hız sınırı testleri bozmasın.
process.env.GUEST_RETURN_RATE_MAX = process.env.GUEST_RETURN_RATE_MAX || "1000"
