(function () {
  const searchBtn     = document.getElementById('searchBtn');
  const searchPanel   = document.getElementById('searchPanel');
  const searchInput   = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  let timer;

  searchBtn.addEventListener('click', e => {
    e.preventDefault();
    const opening = !searchPanel.classList.contains('open');
    searchPanel.classList.toggle('open');
    if (opening) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      searchResults.innerHTML = '';
    }
  });

  document.addEventListener('click', e => {
    if (!searchPanel.contains(e.target) && !searchBtn.contains(e.target)) {
      searchPanel.classList.remove('open');
      searchInput.value = '';
      searchResults.innerHTML = '';
    }
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    const q = searchInput.value.trim();
    if (!q) { searchResults.innerHTML = ''; return; }
    timer = setTimeout(() => fetchResults(q), 300);
  });

  async function fetchResults(q) {
    const res      = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
    const products = await res.json();
    if (!products.length) {
      searchResults.innerHTML = '<p class="search-empty">No products found</p>';
      return;
    }
    searchResults.innerHTML = products.map(p => `
      <a href="product.html?id=${p.id}" class="search-result-card">
        <img src="${cloudinaryUrl(p.image, 120)}" alt="${p.name}" class="search-result-img" />
        <div class="search-result-info">
          <span class="search-result-name">${p.name}</span>
          <span class="search-result-price">€${p.price.toFixed(2)}</span>
        </div>
      </a>
    `).join('');
  }
})();
