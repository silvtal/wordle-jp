## I used kakasi to change kanji/katakana into hiragana from the Japanese WordNet database
cat japanese_wordnet_words/wnjpn-ok.tab | cut  -f2  | grep -v "～" | grep -v "･" | grep -v '[a-zA-Z0-9ヸº]' | grep -Pv "\p{Arabic}" |  iconv -f utf-8 -t eucjp |kakasi -JH -KH -Ea -s | iconv -f eucjp -t utf8 | tr -d " " > japanese_wordnet_words/hiragana-words.txt

cat japanese_wordnet_words/hiragana-words.txt | iconv -f utf8 -t eucjp | kakasi -i euc -Ha -Ka -Ja -Ea -ka -s > japanese_wordnet_words/romaji-words.txt

grep -x '.\{5\}' < japanese_wordnet_words/romaji-words.txt > wordle-jp-5-raw.txt

# add missing but suitable words
cat extra-words.txt >> wordle-jp-5-raw.txt
# filtering by "are these words ok"
#             remove loans/inappropiate words...   remove ', spaces...     remove repeats  nums again
grep -v -x -f bad-words.txt wordle-jp-5-raw.txt | grep -v "'" | grep -v " " | sort -u | grep -v '[0-9]' > jp-words-5.txt 

# filtered by "have we seen them already?"
cp jp-words-5.txt wordle-jp-5-filtered.txt # in buld-custom-tasks we can see this is "all" words
cp jp-words-5.txt wordle-jp-5-filter1.txt  # 1 has all suitable words. 2 is the same as 1 but removing the already seen ones, which are marked in filtered with a preceeding dot. in buld-custom-tasks we can see this is "all new" words

# TODO filter2 has the used ones. How does that work?? add SHIKU

## correr node getnew
## importante: correr "node build-custom-tasks.js --prod" para re-generar words.js

