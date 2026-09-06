export const adsConfig = {
    enabled: false,
    publisherId: "",
    slots: {
        articleTop: "",
        articleMiddle: "",
        articleBottom: "",
        filmDetail: "",
        listContent: "",
        homepage: ""
    }
};

export const isValidAdsensePublisherId = (value = adsConfig.publisherId) => (
    /^ca-pub-\d+$/.test(String(value).trim())
);

export const isValidAdsenseSlotId = (value) => (
    /^\d+$/.test(String(value ?? "").trim())
);

export const isAdsenseEnabled = () => (
    adsConfig.enabled === true && isValidAdsensePublisherId()
);

/*
 * AdSense onayından sonra yalnızca enabled, publisherId ve slots değerlerini güncelleyin.
 * Google'ın verdiği ads.txt satırını public/ads.txt dosyasına ekleyin.
 * Dosya production ortamında https://merakatlası.com/ads.txt adresinden erişilebilir olur.
 * Gerçek publisher bilgisi verilene kadar public/ads.txt oluşturmayın.
 */
