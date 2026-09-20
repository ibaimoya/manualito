---
title: Abstract
description: Abstract and keywords of the project dissertation.
sidebar:
  order: 0.1
---

Learning a board game can require extensive reading of its rulebook, in addition, resolving a question during play means finding the relevant rule. To support both tasks, *Manualito* was developed as a web application that lets users quickly obtain an overview of a game and ask an artificial intelligence assistant questions about it.

The application extracts text from rulebooks supplied as **PDF** files or images, using optical character recognition when necessary, and allows users to review it alongside the original pages. It then combines keyword and semantic search to select the information provided to locally run language models. This retrieval-augmented generation approach aims to reduce the risk of the assistant inventing rules, while references to the source pages allow users to check its answers.

During development, alternatives for text recognition, retrieval and language models were compared to adapt the system to the available resources. The resulting application combines these functions with the management of games, rulebooks and conversations, allowing users to save the information and return to it in future game sessions.

## Keywords

Board games, web application, optical character recognition, language models, retrieval-augmented generation, artificial intelligence, natural language processing, information retrieval, hybrid search, rule consultation.
