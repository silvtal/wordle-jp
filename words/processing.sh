## I used kakasi to change kanji/katakana into hiragana from the Japanese WordNet database
cat japanese_wordnet_words/wnjpn-ok.tab | cut  -f2  | grep -v "～" | grep -v "･" | grep -v '[a-zA-Z0-9ヸº]' | grep -Pv "\p{Arabic}" |  iconv -f utf-8 -t eucjp |kakasi -JH -KH -Ea -s | iconv -f eucjp -t utf8 | tr -d " " > japanese_wordnet_words/hiragana-words.txt

cat japanese_wordnet_words/hiragana-words.txt | iconv -f utf8 -t eucjp | kakasi -i euc -Ha -Ka -Ja -Ea -ka -s > japanese_wordnet_words/romaji-words.txt

grep -x '.\{5\}' < japanese_wordnet_words/romaji-words.txt > jp-words-5.txt

# filtering here TODO
cp jp-words-5.txt wordle-jp-5-raw.txt
