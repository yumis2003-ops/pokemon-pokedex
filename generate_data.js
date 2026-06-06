const fs = require('fs');
const path = require('path');

// カタカナをひらがなに変換するヘルパー（検索用）
function toHiragana(str) {
  return str.replace(/[\u30a1-\u30f6]/g, function(match) {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

async function fetchPokemonData() {
  console.log("PokeAPIからポケモン名データの取得を開始します...");
  
  // 1. 全ポケモンのspeciesリストを取得 (現時点で1025種)
  const limit = 1025;
  const listUrl = `https://pokeapi.co/api/v2/pokemon-species?limit=${limit}`;
  
  try {
    const response = await fetch(listUrl);
    const data = await response.json();
    const results = data.results;
    
    console.log(`全 ${results.length} 匹のポケモンの基本情報を取得しました。日本語名のフェッチを開始します...`);
    
    const pokemonList = [];
    const concurrency = 20; // 同時実行数
    
    for (let i = 0; i < results.length; i += concurrency) {
      const chunk = results.slice(i, i + concurrency);
      const promises = chunk.map(async (item) => {
        // IDの抽出 (例: "https://pokeapi.co/api/v2/pokemon-species/1/" -> 1)
        const id = parseInt(item.url.split('/').filter(Boolean).pop());
        
        try {
          const detailRes = await fetch(item.url);
          const detail = await detailRes.json();
          
          // 日本語名を探す (ja または ja-Hrkt)
          let nameJa = "";
          const nameJaObj = detail.names.find(n => n.language.name === 'ja');
          if (nameJaObj) {
            nameJa = nameJaObj.name;
          } else {
            const nameJaHrktObj = detail.names.find(n => n.language.name === 'ja-Hrkt');
            nameJa = nameJaHrktObj ? nameJaHrktObj.name : item.name;
          }
          
          // 英語名
          const nameEnObj = detail.names.find(n => n.language.name === 'en');
          const nameEn = nameEnObj ? nameEnObj.name : item.name;
          
          // 検索用にカタカナからひらがなへの変換キー、英語小文字キーを追加
          const kana = nameJa;
          const hira = toHiragana(kana);
          
          return {
            id: id,
            nameJa: nameJa,
            nameEn: nameEn,
            hira: hira,
            nameEnLower: nameEn.toLowerCase()
          };
        } catch (err) {
          console.error(`ID: ${id} の取得に失敗しました。再試行します...`, err);
          // 簡易フォールバック
          return {
            id: id,
            nameJa: item.name,
            nameEn: item.name,
            hira: item.name.toLowerCase(),
            nameEnLower: item.name.toLowerCase()
          };
        }
      });
      
      const chunkResults = await Promise.all(promises);
      pokemonList.push(...chunkResults);
      console.log(`進行状況: ${pokemonList.length} / ${results.length}`);
    }
    
    // ID順にソート
    pokemonList.sort((a, b) => a.id - b.id);
    
    // ファイル書き出し
    const outputFilePath = path.join(__dirname, 'pokemon_data.js');
    const fileContent = `// 自動生成されたポケモン対照データ
const POKEMON_DATA = ${JSON.stringify(pokemonList, null, 2)};
if (typeof module !== 'undefined') {
  module.exports = POKEMON_DATA;
}
`;
    fs.writeFileSync(outputFilePath, fileContent, 'utf-8');
    console.log(`データ生成完了! ファイル保存先: ${outputFilePath}`);
    
  } catch (error) {
    console.error("データのフェッチ中にエラーが発生しました:", error);
  }
}

fetchPokemonData();
