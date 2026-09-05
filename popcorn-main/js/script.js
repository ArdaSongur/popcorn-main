// ========================================
// VERİLERİ TUTACAK DEĞİŞKENLER
// (data.json yüklenince doldurulacak)
// ========================================

let movies = [];
let series = [];
let allContent = [];
let lists = [];


// ========================================
// FİLM KARTI OLUŞTURMA
// ========================================

function createCard(item) {

    return `

        <article class="movie-card">

            <a href="detail.html?id=${item.id}">

                <div class="poster-container">

                    <img
                        src="${item.image}"
                        alt="${item.title}"
                    >

                    <div class="rating">
                        ⭐ ${item.rating}
                    </div>

                </div>

            </a>


            <div class="movie-info">

                <h3>
                    ${item.title}
                </h3>

                <p>
                    ${item.year} • ${item.genre}
                </p>


                <button
                    class="favorite-button ${isFavorite(item.id) ? "is-favorite" : ""}"
                    data-id="${item.id}"
                    onclick="toggleFavorite(${item.id})"
                >
                    ${isFavorite(item.id) ? "❤️ Favoride" : "🤍 Favori"}
                </button>

            </div>

        </article>

    `;
}


// ========================================
// FAVORİ SİSTEMİ
// ========================================

function getFavorites() {
    return JSON.parse(localStorage.getItem("favorites")) || [];
}

function isFavorite(id) {
    return getFavorites().includes(id);
}

function toggleFavorite(id) {

    let favorites = getFavorites();

    if (favorites.includes(id)) {
        favorites = favorites.filter(favId => favId !== id);
    } else {
        favorites.push(id);
    }

    localStorage.setItem("favorites", JSON.stringify(favorites));

    refreshFavoriteButtons();

    if (document.getElementById("allFavorites")) {
        renderFavorites();
    }

}

function refreshFavoriteButtons() {

    document.querySelectorAll(".favorite-button[data-id]").forEach(button => {

        const id = Number(button.dataset.id);
        const favorited = isFavorite(id);

        button.classList.toggle("is-favorite", favorited);

        button.textContent = button.classList.contains("primary-button")
            ? (favorited ? "❤️ Favorilerde" : "🤍 Favorilere Ekle")
            : (favorited ? "❤️ Favoride" : "🤍 Favori");

    });

}

function renderFavorites() {

    const allFavorites = document.getElementById("allFavorites");
    const favoritesEmpty = document.getElementById("favoritesEmpty");

    if (!allFavorites) return;

    const favoriteIds = getFavorites();
    const favoriteItems = allContent.filter(item => favoriteIds.includes(item.id));

    if (favoriteItems.length === 0) {
        allFavorites.innerHTML = "";
        if (favoritesEmpty) favoritesEmpty.style.display = "block";
    } else {
        if (favoritesEmpty) favoritesEmpty.style.display = "none";
        allFavorites.innerHTML = favoriteItems.map(createCard).join("");
    }

}


// ========================================
// SAYFA İÇERİĞİNİ OLUŞTURAN ANA FONKSİYON
// (veriler data.json'dan yüklendikten sonra çağrılır)
// ========================================

function initApp() {

    // ---- POPÜLER FİLMLER ----

    const popularMovies = document.getElementById("popularMovies");

    if (popularMovies) {
        popularMovies.innerHTML = movies.map(createCard).join("");
    }


    // ---- POPÜLER DİZİLER ----

    const popularSeries = document.getElementById("popularSeries");

    if (popularSeries) {
        popularSeries.innerHTML = series.map(createCard).join("");
    }


    // ---- TÜM FİLMLER ----

    const allMovies = document.getElementById("allMovies");

    if (allMovies) {

        function showMovies(list) {
            allMovies.innerHTML = list.map(createCard).join("");
        }

        showMovies(movies);

        const movieSearch = document.getElementById("movieSearch");
        const genreFilter = document.getElementById("genreFilter");

        function filterMovies() {

            const searchText = movieSearch.value.toLowerCase();
            const selectedGenre = genreFilter.value;

            const filtered = movies.filter(movie => {
                const matchesSearch = movie.title.toLowerCase().includes(searchText);
                const matchesGenre = selectedGenre === "all" || movie.genre === selectedGenre;
                return matchesSearch && matchesGenre;
            });

            showMovies(filtered);

        }

        movieSearch.addEventListener("input", filterMovies);
        genreFilter.addEventListener("change", filterMovies);

    }


    // ---- TÜM DİZİLER ----

    const allSeries = document.getElementById("allSeries");

    if (allSeries) {

        function showSeries(list) {
            allSeries.innerHTML = list.map(createCard).join("");
        }

        showSeries(series);

        const seriesSearch = document.getElementById("seriesSearch");
        const seriesGenreFilter = document.getElementById("seriesGenreFilter");

        function filterSeries() {

            const searchText = seriesSearch.value.toLowerCase();
            const selectedGenre = seriesGenreFilter.value;

            const filtered = series.filter(item => {
                const matchesSearch = item.title.toLowerCase().includes(searchText);
                const matchesGenre = selectedGenre === "all" || item.genre === selectedGenre;
                return matchesSearch && matchesGenre;
            });

            showSeries(filtered);

        }

        seriesSearch.addEventListener("input", filterSeries);
        seriesGenreFilter.addEventListener("change", filterSeries);

    }


        // ---- DETAY SAYFASI ----

    
    const movieDetail = document.getElementById("movieDetail");

    if (movieDetail) {

        const params = new URLSearchParams(window.location.search);
        const id = Number(params.get("id"));
        const item = allContent.find(content => content.id === id);

        if (item) {

            movieDetail.innerHTML = `

                <div class="detail-container">

                    <div class="detail-poster">
                        <img src="${item.image}" alt="${item.title}">
                    </div>

                    <div class="detail-info">

                        <span class="detail-type">
                            ${item.type === "movie" ? "🎬 FİLM" : "📺 DİZİ"}
                        </span>

                        <h1>${item.title}</h1>

                        <div class="detail-meta">
                            <span>📅 ${item.year}</span>
                            <span>⭐ ${item.rating}</span>
                            <span>🎭 ${item.genre}</span>
                        </div>

                        <p>${item.description}</p>

                        <button
                            class="primary-button favorite-button ${isFavorite(item.id) ? "is-favorite" : ""}"
                            data-id="${item.id}"
                            onclick="toggleFavorite(${item.id})"
                        >
                            ${isFavorite(item.id) ? "❤️ Favorilerde" : "🤍 Favorilere Ekle"}
                        </button>

                        <a href="javascript:history.back()" class="back-button">
                            ← Geri Dön
                        </a>

                    </div>

                </div>

            `;

            document.title = `Popcorn | ${item.title}`;

        } else {

            movieDetail.innerHTML = `

                <div class="not-found">
                    <h1>😕 İçerik bulunamadı</h1>
                    <p>Aradığın film veya dizi mevcut değil.</p>
                    <a href="index.html" class="primary-button">Ana Sayfaya Dön</a>
                </div>

            `;

        }

    }


    // ---- YAZILAR (LİSTE) SAYFASI ----

    const allLists = document.getElementById("allLists");

    if (allLists) {

        allLists.innerHTML = lists.map(list => `

            <a href="list-detail.html?slug=${list.slug}" class="list-card">

                <div class="list-cover">
                    <img src="${list.cover}" alt="${list.title}">
                </div>

                <div class="list-card-info">
                    <h3>${list.title}</h3>
                    <p>${list.intro}</p>
                </div>

            </a>

        `).join("");

    }


    // ---- YAZI DETAYI ----

    const listDetail = document.getElementById("listDetail");

    if (listDetail) {

        const params = new URLSearchParams(window.location.search);
        const slug = params.get("slug");
        const list = lists.find(l => l.slug === slug);

        if (list) {

            const picksHtml = list.picks.map(pick => {

                const item = allContent.find(c => c.id === pick.contentId);
                if (!item) return "";

                return `
                    <div class="list-pick">

                        <a href="detail.html?id=${item.id}" class="list-pick-poster">
                            <img src="${item.image}" alt="${item.title}">
                        </a>

                        <div class="list-pick-info">
                            <h3>${item.title} <span>(${item.year})</span></h3>
                            <p class="list-pick-note">${pick.note}</p>
                        </div>

                    </div>
                `;

            }).join("");

            listDetail.innerHTML = `

                <div class="list-header">
                    <span class="detail-type">✍️ YAZI</span>
                    <h1>${list.title}</h1>
                    <p class="list-intro">${list.intro}</p>
                </div>

                <div class="list-picks">
                    ${picksHtml}
                </div>

                <a href="lists.html" class="back-button">← Tüm Yazılara Dön</a>

            `;

            document.title = `Popcorn | ${list.title}`;

        } else {

            listDetail.innerHTML = `
                <div class="not-found">
                    <h1>😕 Yazı bulunamadı</h1>
                    <a href="lists.html" class="primary-button">Tüm Yazılara Dön</a>
                </div>
            `;

        }

    }



    // ---- FAVORİLER SAYFASI ----

    renderFavorites();


    // ---- ANA SAYFA ARAMA ----

    const searchInput = document.getElementById("searchInput");
    const searchResults = document.getElementById("searchResults");

    if (searchInput && searchResults) {

        searchInput.addEventListener("input", function () {

            const query = searchInput.value.trim().toLowerCase();

            if (query === "") {
                searchResults.style.display = "none";
                searchResults.innerHTML = "";
                return;
            }

            const matches = allContent.filter(item =>
                item.title.toLowerCase().includes(query)
            );

            if (matches.length === 0) {
                searchResults.innerHTML = `<div class="no-result">Sonuç bulunamadı.</div>`;
            } else {
                searchResults.innerHTML = matches.slice(0, 6).map(item => `
                    <a href="detail.html?id=${item.id}">
                        <img src="${item.image}" alt="${item.title}">
                        <div class="result-info">
                            ${item.title}
                            <span>${item.year} • ${item.type === "movie" ? "Film" : "Dizi"}</span>
                        </div>
                    </a>
                `).join("");
            }

            searchResults.style.display = "block";

        });

        document.addEventListener("click", function (e) {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = "none";
            }
        });

    }

}


// ========================================
// VERİLERİ data.json'DAN YÜKLE
// ========================================

async function loadData() {

    try {

        const [contentResponse, listsResponse] = await Promise.all([
            fetch("data.json"),
            fetch("lists.json")
        ]);

        const data = await contentResponse.json();
        const listsData = await listsResponse.json();

        movies = data.movies;
        series = data.series;
        allContent = [...movies, ...series];
        lists = listsData.lists;

        initApp();

    } catch (error) {

        console.error("Veriler yüklenemedi:", error);

    }

}

loadData();


// ========================================
// DARK / LIGHT MODE
// (veriye ihtiyaç duymadığı için hemen çalışır)
// ========================================

const themeButton = document.getElementById("themeButton");

if (themeButton) {

    themeButton.textContent =
        document.body.classList.contains("light-mode") ? "☀️" : "🌙";

    themeButton.addEventListener("click", function () {

        document.body.classList.toggle("light-mode");

        const isLight = document.body.classList.contains("light-mode");

        themeButton.textContent = isLight ? "☀️" : "🌙";

        localStorage.setItem("theme", isLight ? "light" : "dark");

    });

}

console.log("SCRIPT ÇALIŞIYOR");