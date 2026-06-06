// ポケモン図鑑アプリケーションロジック

// 状態管理オブジェクト
const state = {
  currentState: 'boot', // 'boot' | 'list' | 'detail' | 'search'
  pokemonList: [],      // 現在表示対象のポケモンリスト（検索結果により変動）
  allPokemon: [],      // 全ポケモンのマスターデータ（POKEMON_DATAからコピー）
  selectedIndex: 0,     // リスト上の選択インデックス
  visibleStartIndex: 0,  // リストの描画開始位置
  visibleCount: 6,      // リスト画面に同時に表示する件数
  
  // 詳細表示中データ
  currentDetailId: 1,
  
  // 検索状態
  searchQuery: '',
  keyboardCursor: { r: 0, c: 0 }, // 50音キーボードのカーソル位置
  
  // テンキーテンポラリ入力
  numericInput: '',
  
  // 音声設定
  soundEnabled: false,
  audioCtx: null
};

// キャッシュオブジェクト
const detailCache = {};

// 日本語の五十音キーボードグリッド配列 (10列 x 5行)
const JP_KEYBOARD = [
  ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'],
  ['サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ', 'テ', 'ト'],
  ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
  ['マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ'],
  ['ル', 'レ', 'ロ', 'ワ', 'ヲ', 'ン', 'ー', 'ッ', '゛', '゜'],
  ['決定', 'クリア', '閉じる', '', '', '', '', '', '', '']
];
// 決定などの特殊キー位置
const SPECIAL_KEYS = {
  '決定': { r: 5, c: 0 },
  'クリア': { r: 5, c: 1 },
  '閉じる': { r: 5, c: 2 }
};

// タイプ日本語変換テーブル
const TYPE_MAP = {
  normal: 'ノーマル',
  fire: 'ほのお',
  water: 'みず',
  grass: 'くさ',
  electric: 'でんき',
  ice: 'こおり',
  fighting: 'かくとう',
  poison: 'どく',
  ground: 'じめん',
  flying: 'ひこう',
  psychic: 'エスパー',
  bug: 'むし',
  rock: 'いわ',
  ghost: 'ゴースト',
  dragon: 'ドラゴン',
  steel: 'はがね',
  dark: 'あく',
  fairy: 'フェアリー'
};

// サウンド合成エンジン (Web Audio API)
function initAudio() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
}

function playSound(type) {
  if (!state.soundEnabled) return;
  initAudio();
  
  const ctx = state.audioCtx;
  const now = ctx.currentTime;
  
  switch(type) {
    case 'click': // リスト移動などの軽いチャカ音
      {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.03);
        
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.03);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.03);
      }
      break;
      
    case 'select': // 決定音 (ピコーン)
      {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'square';
        osc2.type = 'square';
        
        // 和音・または短い2音アルペジオ
        osc1.frequency.setValueAtTime(987.77, now); // B5
        osc1.frequency.setValueAtTime(1318.51, now + 0.06); // E6
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.15);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        
        osc1.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.2);
      }
      break;
      
    case 'cancel': // キャンセル音 (ピピッ)
      {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.setValueAtTime(800, now + 0.05);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.1);
      }
      break;
      
    case 'error': // エラー音 (ブー)
      {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, now);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.25);
      }
      break;
      
    case 'boot': // ゲームボーイ起動音のパロディ (ピーン…ピコーン)
      {
        // 1音目: 高音の澄んだ音 (クリスタル音調のサイン波/矩形波)
        const oscBoot = ctx.createOscillator();
        const gainBoot = ctx.createGain();
        oscBoot.type = 'sine';
        oscBoot.frequency.setValueAtTime(2093.00, now); // C7
        
        gainBoot.gain.setValueAtTime(0.05, now);
        gainBoot.gain.linearRampToValueAtTime(0.03, now + 0.3);
        gainBoot.gain.linearRampToValueAtTime(0.001, now + 0.8);
        
        oscBoot.connect(gainBoot);
        gainBoot.connect(ctx.destination);
        oscBoot.start(now);
        oscBoot.stop(now + 0.8);
        
        // 2音目: おなじみのピコーン (0.8秒後)
        setTimeout(() => {
          if (!state.soundEnabled) return;
          const osc2_1 = ctx.createOscillator();
          const osc2_2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          
          osc2_1.type = 'square';
          osc2_2.type = 'square';
          
          // E6 (1318Hz) -> B6 (1975Hz) の素早いアルペジオ
          const t = ctx.currentTime;
          osc2_1.frequency.setValueAtTime(1318.51, t);
          osc2_1.frequency.setValueAtTime(1975.53, t + 0.05);
          
          gain2.gain.setValueAtTime(0.06, t);
          gain2.gain.linearRampToValueAtTime(0.06, t + 0.3);
          gain2.gain.linearRampToValueAtTime(0.001, t + 0.5);
          
          osc2_1.connect(gain2);
          gain2.connect(ctx.destination);
          
          osc2_1.start(t);
          osc2_1.stop(t + 0.5);
        }, 800);
      }
      break;
  }
}

// 画面遷移切り替え
function setScreen(screenName) {
  // すべての画面を非活性に
  document.querySelectorAll('.screen-content').forEach(el => {
    el.classList.remove('active');
  });
  
  // 指定された画面を表示
  const target = document.getElementById(`screen-${screenName}`);
  if (target) {
    target.classList.add('active');
    state.currentState = screenName;
  }
  
  // LEDの制御
  const led = document.getElementById('led-status');
  if (screenName === 'boot') {
    led.style.background = 'radial-gradient(circle, #ff4d4d 40%, #cc0000 80%)';
  } else if (screenName === 'search') {
    led.style.background = 'radial-gradient(circle, #ffeb3b 40%, #fbc02d 80%)'; // 検索中は黄色
  } else {
    led.style.background = 'radial-gradient(circle, #2ecc71 40%, #27ae60 80%)'; // 通常は緑
  }
}

// リスト表示の描画
function renderList() {
  const container = document.getElementById('pokemon-list-items');
  container.innerHTML = '';
  
  const end = Math.min(state.visibleStartIndex + state.visibleCount, state.pokemonList.length);
  
  for (let i = state.visibleStartIndex; i < end; i++) {
    const p = state.pokemonList[i];
    const item = document.createElement('div');
    item.className = 'list-item dot-text';
    if (i === state.selectedIndex) {
      item.classList.add('selected');
    }
    
    // 図鑑番号のフォーマット (例: No.001)
    const formattedId = `No.${String(p.id).padStart(3, '0')}`;
    
    item.innerHTML = `
      <span class="arrow">▶</span>
      <span class="id-num">${formattedId}</span>
      <span class="p-name">${p.nameJa}</span>
    `;
    
    // クリックイベント
    item.addEventListener('click', () => {
      playSound('click');
      state.selectedIndex = i;
      renderList();
      selectPokemon();
    });
    
    container.appendChild(item);
  }
}

// リストのスクロール制御
function scrollList(direction) {
  if (state.pokemonList.length === 0) return;
  
  playSound('click');
  
  if (direction === 'up') {
    if (state.selectedIndex > 0) {
      state.selectedIndex--;
      if (state.selectedIndex < state.visibleStartIndex) {
        state.visibleStartIndex = state.selectedIndex;
      }
    } else {
      // ループして一番下に
      state.selectedIndex = state.pokemonList.length - 1;
      state.visibleStartIndex = Math.max(0, state.pokemonList.length - state.visibleCount);
    }
  } else if (direction === 'down') {
    if (state.selectedIndex < state.pokemonList.length - 1) {
      state.selectedIndex++;
      if (state.selectedIndex >= state.visibleStartIndex + state.visibleCount) {
        state.visibleStartIndex = state.selectedIndex - state.visibleCount + 1;
      }
    } else {
      // ループして一番上に
      state.selectedIndex = 0;
      state.visibleStartIndex = 0;
    }
  }
  
  renderList();
}

// ページ移動 (左右キーで10件スキップ)
function skipList(direction) {
  if (state.pokemonList.length === 0) return;
  playSound('click');
  
  const skipSize = 10;
  if (direction === 'left') {
    state.selectedIndex = Math.max(0, state.selectedIndex - skipSize);
  } else if (direction === 'right') {
    state.selectedIndex = Math.min(state.pokemonList.length - 1, state.selectedIndex + skipSize);
  }
  
  // 表示開始位置の調整
  if (state.selectedIndex < state.visibleStartIndex) {
    state.visibleStartIndex = state.selectedIndex;
  } else if (state.selectedIndex >= state.visibleStartIndex + state.visibleCount) {
    state.visibleStartIndex = Math.max(0, state.selectedIndex - state.visibleCount + 1);
  }
  
  renderList();
}

// ポケモン選択（決定）
async function selectPokemon() {
  const current = state.pokemonList[state.selectedIndex];
  if (!current) return;
  
  playSound('select');
  setScreen('detail');
  await showPokemonDetail(current.id);
}

// ポケモン詳細データの読み込みと描画
async function showPokemonDetail(id) {
  state.currentDetailId = id;
  
  // UI初期化（ローディング状態）
  document.getElementById('detail-id').textContent = `No.${String(id).padStart(3, '0')}`;
  document.getElementById('detail-name').textContent = 'ロードちゅう';
  document.getElementById('detail-sprite').src = '';
  document.getElementById('detail-type-1').textContent = '-';
  document.getElementById('detail-type-2').textContent = '-';
  document.getElementById('detail-height').textContent = '-';
  document.getElementById('detail-weight').textContent = '-';
  document.getElementById('detail-desc').textContent = 'ずかんデータを　よみこんでいます……';
  
  // 右側サブ画面も読み込み中に
  document.getElementById('right-boot').classList.remove('active');
  document.getElementById('right-compare').classList.add('active');
  document.getElementById('compare-pokemon-img').src = '';
  document.getElementById('compare-pokemon-height').textContent = '--.-m';
  
  try {
    let data = detailCache[id];
    
    if (!data) {
      // APIからデータを取得
      const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      const pokemonData = await pokemonRes.json();
      
      const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
      const speciesData = await speciesRes.json();
      
      // 日本語の情報を抽出
      let nameJa = pokemonData.name;
      const nameJaObj = speciesData.names.find(n => n.language.name === 'ja');
      if (nameJaObj) nameJa = nameJaObj.name;
      
      // 分類 (例: たねポケモン)
      let genusJa = '';
      const genusJaObj = speciesData.genera.find(g => g.language.name === 'ja-Hrkt') || speciesData.genera.find(g => g.language.name === 'ja');
      if (genusJaObj) genusJa = genusJaObj.genus;
      
      // 説明文の取得（初代赤緑を優先、なければ日本語のもの）
      let desc = 'しんかちゅうの　ため　データがありません。';
      // 赤緑(red/blue)、または最新の日本語テキストを優先探索
      const preferredVersions = ['red', 'blue', 'yellow', 'gold', 'silver', 'firered', 'leafgreen', 'x', 'y', 'sun', 'moon'];
      let descObj = null;
      
      // 優先バージョンから探す
      for (const ver of preferredVersions) {
        descObj = speciesData.flavor_text_entries.find(e => 
          e.version.name === ver && (e.language.name === 'ja-Hrkt' || e.language.name === 'ja')
        );
        if (descObj) break;
      }
      
      // なければ任意の日本語テキスト
      if (!descObj) {
        descObj = speciesData.flavor_text_entries.find(e => e.language.name === 'ja-Hrkt' || e.language.name === 'ja');
      }
      
      if (descObj) {
        // 改行や特殊文字のクリーンアップ
        desc = descObj.flavor_text
          .replace(/\u000c/g, ' ')
          .replace(/\n/g, '　');
      }
      
      // スプライト（ドット絵）の選定
      // 初代（赤緑）のゲームボーイスタイルドット絵を優先
      let spriteUrl = '';
      try {
        spriteUrl = pokemonData.sprites.versions['generation-i']['red-blue'].front_default;
      } catch(e) {}
      
      // なければ金銀やクリスタル、最終的に標準ドット絵
      if (!spriteUrl) {
        try {
          spriteUrl = pokemonData.sprites.versions['generation-ii']['crystal'].front_default;
        } catch(e) {}
      }
      if (!spriteUrl) {
        spriteUrl = pokemonData.sprites.front_default;
      }
      
      // タイプ情報の整形
      const types = pokemonData.types.map(t => TYPE_MAP[t.type.name] || t.type.name);
      
      data = {
        id: id,
        name: nameJa,
        genus: genusJa,
        sprite: spriteUrl,
        types: types,
        height: pokemonData.height / 10, // dm -> m
        weight: pokemonData.weight / 10, // hg -> kg
        desc: desc
      };
      
      detailCache[id] = data;
    }
    
    // 詳細画面がすでに切り替わっている、もしくはIDが現在開いているものと一致する場合のみ描画（非同期競合防止）
    if (state.currentDetailId !== id) return;
    
    // UI反映
    document.getElementById('detail-name').textContent = data.name;
    document.getElementById('detail-sprite').src = data.sprite;
    document.getElementById('detail-sprite').alt = data.name;
    
    document.getElementById('detail-type-1').textContent = data.types[0] || '-';
    document.getElementById('detail-type-2').textContent = data.types[1] || 'なし';
    
    document.getElementById('detail-height').textContent = data.height.toFixed(1);
    document.getElementById('detail-weight').textContent = data.weight.toFixed(1);
    
    // 分類が取得できていれば説明文の冒頭に差し込む（初代風: 「〇〇ポケモン たかさXm おもさYkg」）
    const genusStr = data.genus ? `${data.genus}\n` : '';
    document.getElementById('detail-desc').textContent = `${genusStr}${data.desc}`;
    
    // 右側サブ画面: 高さ比べ
    const compareImg = document.getElementById('compare-pokemon-img');
    compareImg.src = data.sprite;
    compareImg.alt = data.name;
    
    const pHeight = data.height;
    document.getElementById('compare-pokemon-height').textContent = `${pHeight.toFixed(1)}m`;
    
    // 身長スケール計算 (レッドの身長は1.7mとし、これを基準高さ 70px とする)
    // ポケモンの表示高さを算出: 70px * (pHeight / 1.7)
    let displayHeight = 70 * (pHeight / 1.7);
    
    // 極端なサイズ調整 (最小15px, 最大110px)
    if (displayHeight < 15) displayHeight = 15;
    if (displayHeight > 110) displayHeight = 110;
    
    compareImg.style.height = `${displayHeight}px`;
    
  } catch (error) {
    console.error("詳細データの取得に失敗しました:", error);
    document.getElementById('detail-name').textContent = 'エラー';
    document.getElementById('detail-desc').textContent = 'データの　よみこみに　しっぱい　しました。Aボタンで　リトライ　してください。';
    playSound('error');
  }
}

// 検索画面の表示処理
function showSearch() {
  playSound('select');
  setScreen('search');
  state.searchQuery = '';
  document.getElementById('search-input').value = '';
  state.keyboardCursor = { r: 0, c: 0 };
  renderSearchKeyboard();
}

// 50音キーボードの描画
function renderSearchKeyboard() {
  const container = document.getElementById('search-keyboard');
  container.innerHTML = '';
  
  for (let r = 0; r < JP_KEYBOARD.length; r++) {
    for (let c = 0; c < JP_KEYBOARD[r].length; c++) {
      const char = JP_KEYBOARD[r][c];
      if (char === '') continue; // 空白セルはスキップ
      
      const keyEl = document.createElement('div');
      keyEl.className = 'key-char dot-text';
      keyEl.textContent = char;
      
      // 特殊キーの幅調整
      if (char === '決定' || char === 'クリア' || char === '閉じる') {
        keyEl.style.gridColumn = 'span 3';
      }
      
      // 選択カーソル判定
      const isSelected = (state.keyboardCursor.r === r && state.keyboardCursor.c === c) ||
                         (r === 5 && state.keyboardCursor.r === 5 && 
                          ((state.keyboardCursor.c >= 0 && state.keyboardCursor.c <= 2 && char === '決定' && c === 0) ||
                           (state.keyboardCursor.c >= 3 && state.keyboardCursor.c <= 5 && char === 'クリア' && c === 1) ||
                           (state.keyboardCursor.c >= 6 && state.keyboardCursor.c <= 9 && char === '閉じる' && c === 2)));
      
      if (isSelected) {
        keyEl.classList.add('selected');
      }
      
      // クリックによる直接選択
      keyEl.addEventListener('click', () => {
        playSound('click');
        state.keyboardCursor = { r, c };
        renderSearchKeyboard();
        handleKeyboardSelect(char);
      });
      
      container.appendChild(keyEl);
    }
  }
}

// キーボードでの文字入力処理
function handleKeyboardSelect(char) {
  if (char === '決定') {
    executeSearch();
  } else if (char === 'クリア') {
    if (state.searchQuery.length > 0) {
      playSound('cancel');
      state.searchQuery = state.searchQuery.slice(0, -1);
      document.getElementById('search-input').value = state.searchQuery;
    } else {
      playSound('error');
    }
  } else if (char === '閉じる') {
    playSound('cancel');
    setScreen('list');
  } else {
    // 最大8文字制限 (初代仕様)
    if (state.searchQuery.length < 8) {
      playSound('click');
      state.searchQuery += char;
      document.getElementById('search-input').value = state.searchQuery;
    } else {
      playSound('error');
    }
  }
}

// 50音キーボード内でのカーソル移動
function moveKeyboardCursor(direction) {
  playSound('click');
  let { r, c } = state.keyboardCursor;
  
  if (direction === 'up') {
    r = (r > 0) ? r - 1 : JP_KEYBOARD.length - 1;
  } else if (direction === 'down') {
    r = (r < JP_KEYBOARD.length - 1) ? r + 1 : 0;
  } else if (direction === 'left') {
    if (r === 5) {
      c = (c > 0) ? c - 3 : 9; // 特殊キーは3列スパンなので3つ移動
    } else {
      c = (c > 0) ? c - 1 : 9;
    }
  } else if (direction === 'right') {
    if (r === 5) {
      c = (c < 9) ? c + 3 : 0;
    } else {
      c = (c < 9) ? c + 1 : 0;
    }
  }
  
  // 正規化 (特殊キーエリアの補正)
  if (r === 5) {
    if (c < 3) c = 0; // 決定
    else if (c < 6) c = 1; // クリア
    else c = 2; // 閉じる
  }
  
  state.keyboardCursor = { r, c };
  renderSearchKeyboard();
}

// 検索の実行
function executeSearch() {
  const query = state.searchQuery.trim();
  
  if (query === '') {
    // 検索語が空なら全リストに戻す
    state.pokemonList = [...state.allPokemon];
    state.selectedIndex = 0;
    state.visibleStartIndex = 0;
    playSound('select');
    setScreen('list');
    renderList();
    return;
  }
  
  // カタカナ・ひらがな両対応でマッチング
  const isKatakana = /[\u30a1-\u30f6]/;
  const isHiragana = /[\u3041-\u3096]/;
  
  let matchQuery = query;
  // ひらがな・カタカナ統一検索のため、すべてひらがなに変換して比較
  function toHira(str) {
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    });
  }
  
  const queryHira = toHira(query).toLowerCase();
  
  const results = state.allPokemon.filter(p => {
    const idStr = String(p.id);
    return p.hira.includes(queryHira) || 
           p.nameEnLower.includes(queryHira) || 
           idStr === query;
  });
  
  if (results.length > 0) {
    playSound('select');
    state.pokemonList = results;
    state.selectedIndex = 0;
    state.visibleStartIndex = 0;
    setScreen('list');
    renderList();
  } else {
    // マッチしない場合はブー音
    playSound('error');
    const input = document.getElementById('search-input');
    input.value = 'みつかりません';
    setTimeout(() => {
      input.value = state.searchQuery;
    }, 1000);
  }
}

// テンキー入力の処理 (図鑑番号直接ジャンプ)
function handleNumericInput(val) {
  if (val === 'clear') {
    playSound('cancel');
    state.numericInput = '';
    return;
  }
  
  if (val === 'go') {
    if (state.numericInput !== '') {
      const targetId = parseInt(state.numericInput);
      // 登録範囲内（1〜1025）かチェック
      const found = state.allPokemon.find(p => p.id === targetId);
      if (found) {
        playSound('select');
        // 全リストから対象のインデックスを探してジャンプ
        state.pokemonList = [...state.allPokemon]; // 検索フィルタをリセット
        const globalIdx = state.allPokemon.findIndex(p => p.id === targetId);
        state.selectedIndex = globalIdx;
        state.visibleStartIndex = Math.max(0, globalIdx - Math.floor(state.visibleCount / 2));
        
        setScreen('detail');
        showPokemonDetail(targetId);
        
        state.numericInput = '';
      } else {
        playSound('error');
        state.numericInput = '';
      }
    } else {
      playSound('error');
    }
    return;
  }
  
  // 最大4桁
  if (state.numericInput.length < 4) {
    playSound('click');
    state.numericInput += val;
    // 右側ディスプレイに一時的に番号を表示するなどのリッチ演出
    const formattedNum = `No.${state.numericInput.padStart(3, '0')}`;
    document.getElementById('compare-pokemon-height').textContent = formattedNum;
  } else {
    playSound('error');
  }
}

// 物理キーボード押下イベントのマッピング
function handleKeyDown(e) {
  // Boot画面時はキー入力でリスト画面へスキップ
  if (state.currentState === 'boot') {
    playSound('select');
    setScreen('list');
    renderList();
    e.preventDefault();
    return;
  }
  
  // 音声ON/OFFのSキー
  if (e.key.toLowerCase() === 's') {
    toggleSound();
    e.preventDefault();
    return;
  }
  
  if (state.currentState === 'list') {
    switch(e.key) {
      case 'ArrowUp':
        scrollList('up');
        e.preventDefault();
        break;
      case 'ArrowDown':
        scrollList('down');
        e.preventDefault();
        break;
      case 'ArrowLeft':
        skipList('left');
        e.preventDefault();
        break;
      case 'ArrowRight':
        skipList('right');
        e.preventDefault();
        break;
      case 'Enter':
      case 'z':
      case 'Z':
        selectPokemon();
        e.preventDefault();
        break;
      case 'Escape':
      case 'x':
      case 'X':
        // 全件表示に戻す
        if (state.pokemonList.length !== state.allPokemon.length) {
          playSound('cancel');
          state.pokemonList = [...state.allPokemon];
          state.selectedIndex = 0;
          state.visibleStartIndex = 0;
          renderList();
        }
        e.preventDefault();
        break;
      case ' ': // SELECTキーの代わり
        showSearch();
        e.preventDefault();
        break;
    }
  } 
  
  else if (state.currentState === 'detail') {
    switch(e.key) {
      case 'Backspace':
      case 'Escape':
      case 'x':
      case 'X':
      case 'b':
      case 'B':
        playSound('cancel');
        setScreen('list');
        renderList();
        e.preventDefault();
        break;
      case 'Enter':
      case 'z':
      case 'Z':
      case 'a':
      case 'A':
        // エラー時のリトライ、または何もしない
        if (document.getElementById('detail-name').textContent === 'エラー') {
          showPokemonDetail(state.currentDetailId);
        }
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        // 前のポケモンへ
        if (state.selectedIndex > 0) {
          playSound('click');
          state.selectedIndex--;
          const prevPokemon = state.pokemonList[state.selectedIndex];
          showPokemonDetail(prevPokemon.id);
        }
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        // 次のポケモンへ
        if (state.selectedIndex < state.pokemonList.length - 1) {
          playSound('click');
          state.selectedIndex++;
          const nextPokemon = state.pokemonList[state.selectedIndex];
          showPokemonDetail(nextPokemon.id);
        }
        e.preventDefault();
        break;
    }
  } 
  
  else if (state.currentState === 'search') {
    // 物理キーボードでの直接タイピングも許可
    if (e.key === 'Enter') {
      executeSearch();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      playSound('cancel');
      setScreen('list');
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      if (state.searchQuery.length > 0) {
        playSound('cancel');
        state.searchQuery = state.searchQuery.slice(0, -1);
        document.getElementById('search-input').value = state.searchQuery;
      } else {
        playSound('error');
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      moveKeyboardCursor('up');
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      moveKeyboardCursor('down');
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      moveKeyboardCursor('left');
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      moveKeyboardCursor('right');
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      // スペースキーで50音の「決定」を押す
      const r = state.keyboardCursor.r;
      const c = state.keyboardCursor.c;
      const char = JP_KEYBOARD[r][c];
      if (char !== '') {
        handleKeyboardSelect(char);
      }
      e.preventDefault();
    } else if (e.key.length === 1) {
      // 英数字や直接のカナ入力を制限付きでサポート
      const char = e.key.toUpperCase();
      // ひらがな・カタカナ・英数字のみ
      if (/[\u3040-\u30ff\u30a0-\u30ffA-Z0-9ー]/.test(char) && state.searchQuery.length < 8) {
        playSound('click');
        state.searchQuery += char;
        document.getElementById('search-input').value = state.searchQuery;
      }
      e.preventDefault();
    }
  }
}

// サウンドのオンオフ切り替え
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  const toggleBtn = document.getElementById('sound-toggle');
  
  if (state.soundEnabled) {
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-checked', 'true');
    initAudio();
    playSound('boot');
  } else {
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-checked', 'false');
  }
}

// イベントリスナーのバインド
function bindEvents() {
  // 物理キーボード
  window.addEventListener('keydown', handleKeyDown);
  
  // D-PADボタン
  document.getElementById('btn-up').addEventListener('click', () => {
    if (state.currentState === 'list') scrollList('up');
    else if (state.currentState === 'search') moveKeyboardCursor('up');
    else if (state.currentState === 'detail') {
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        showPokemonDetail(state.pokemonList[state.selectedIndex].id);
      }
    }
  });
  document.getElementById('btn-down').addEventListener('click', () => {
    if (state.currentState === 'list') scrollList('down');
    else if (state.currentState === 'search') moveKeyboardCursor('down');
    else if (state.currentState === 'detail') {
      if (state.selectedIndex < state.pokemonList.length - 1) {
        state.selectedIndex++;
        showPokemonDetail(state.pokemonList[state.selectedIndex].id);
      }
    }
  });
  document.getElementById('btn-left').addEventListener('click', () => {
    if (state.currentState === 'list') skipList('left');
    else if (state.currentState === 'search') moveKeyboardCursor('left');
    else if (state.currentState === 'detail') {
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        showPokemonDetail(state.pokemonList[state.selectedIndex].id);
      }
    }
  });
  document.getElementById('btn-right').addEventListener('click', () => {
    if (state.currentState === 'list') skipList('right');
    else if (state.currentState === 'search') moveKeyboardCursor('right');
    else if (state.currentState === 'detail') {
      if (state.selectedIndex < state.pokemonList.length - 1) {
        state.selectedIndex++;
        showPokemonDetail(state.pokemonList[state.selectedIndex].id);
      }
    }
  });
  
  // A / Bボタン
  document.getElementById('btn-a').addEventListener('click', () => {
    if (state.currentState === 'boot') {
      playSound('select');
      setScreen('list');
      renderList();
    } else if (state.currentState === 'list') {
      selectPokemon();
    } else if (state.currentState === 'search') {
      // 50音の現在カーソル値を取得して入力
      const char = JP_KEYBOARD[state.keyboardCursor.r][state.keyboardCursor.c];
      if (char !== '') handleKeyboardSelect(char);
    } else if (state.currentState === 'detail') {
      if (document.getElementById('detail-name').textContent === 'エラー') {
        showPokemonDetail(state.currentDetailId);
      }
    }
  });
  
  document.getElementById('btn-b').addEventListener('click', () => {
    if (state.currentState === 'list') {
      // 全件表示に戻す
      if (state.pokemonList.length !== state.allPokemon.length) {
        playSound('cancel');
        state.pokemonList = [...state.allPokemon];
        state.selectedIndex = 0;
        state.visibleStartIndex = 0;
        renderList();
      }
    } else if (state.currentState === 'detail') {
      playSound('cancel');
      setScreen('list');
      renderList();
    } else if (state.currentState === 'search') {
      // 1文字消去または戻る
      if (state.searchQuery.length > 0) {
        playSound('cancel');
        state.searchQuery = state.searchQuery.slice(0, -1);
        document.getElementById('search-input').value = state.searchQuery;
      } else {
        playSound('cancel');
        setScreen('list');
      }
    }
  });
  
  // SELECT / START
  document.getElementById('btn-select').addEventListener('click', () => {
    if (state.currentState === 'list') {
      showSearch();
    } else if (state.currentState === 'search') {
      playSound('cancel');
      setScreen('list');
    }
  });
  
  document.getElementById('btn-start').addEventListener('click', () => {
    toggleSound();
  });
  
  // サウンドスイッチ
  document.getElementById('sound-toggle').addEventListener('click', toggleSound);
  
  // テンキーボタン
  document.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.target.getAttribute('data-val');
      handleNumericInput(val);
    });
  });
  
  // 起動時のアニメーションスキップ（画面タップ）
  document.getElementById('screen-boot').addEventListener('click', () => {
    playSound('select');
    setScreen('list');
    renderList();
  });
}

// アプリケーション初期化
function init() {
  // グローバル変数 POKEMON_DATA の存在チェック
  if (typeof POKEMON_DATA !== 'undefined') {
    state.allPokemon = POKEMON_DATA;
    state.pokemonList = [...POKEMON_DATA];
  } else {
    console.error("pokemon_data.js がロードされていません。");
    // フォールバック
    state.allPokemon = [{ id: 1, nameJa: "フシギダネ", nameEn: "Bulbasaur", hira: "ふしぎだね", nameEnLower: "bulbasaur" }];
    state.pokemonList = [...state.allPokemon];
  }
  
  bindEvents();
  
  // 起動画面演出
  setTimeout(() => {
    if (state.currentState === 'boot') {
      // サウンドON状態なら起動音を鳴らしているが、初期ロード時はブラウザ制限のため自動再生しない
      setScreen('list');
      renderList();
    }
  }, 3000);
}

// ロード完了時に起動
window.addEventListener('DOMContentLoaded', init);
