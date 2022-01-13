# Daily word guessing game in Japanese

This is an adaptation of Josh Wardle's original game, Wordle, into Japanese. Forked and modified from gugray's version in Hungarian.

### Japanese adaptation and motivation

This game uses hiragana instead of the Latin alphabet. Since there are double the symbols in the 
hiragana alphabet, I decided to add more rows/tries.

I decided to make this version in order to both get experience with HTML and learn more Japanese
vocabulary.

### How to build and develop

Install packages using Yarn, then run build.js as below. Build process
tested on Node v16.

```
yarn
node build.js --prod       ; Builds minified version
node build.js --watch      ; Builds with source map and launches with LiveReload
```

There is no framework and (almost) no dependencies in the built version. There is no
backend component; nothing about the gameplay is logged.
The `public` folder contains everything to publish as a static site.

### Japanese word list

The underlying 5-kana words have been compiled from multiple sources:

<!-- TODO look for sources ! -->

The list has been manually revised and curated to remove noise, proper names and conjugated forms.
The quizzes also omit slang, obvious borrowings, non-standard and vulgar words.

<!-- TODO curate ! -->

