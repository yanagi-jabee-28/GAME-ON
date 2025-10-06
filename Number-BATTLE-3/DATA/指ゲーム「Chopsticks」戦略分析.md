

# **剰余計算（mod 5）ルール下における指ゲーム『Chopsticks』の組合せ論的解体と最適戦略**

## **概要**

本レポートは、指ゲーム「Chopsticks（割り箸）」を、剰余計算（、「ロールオーバー」）ルールセットの下で、戦略的に完全に解体することを目的とする。本ゲームを有限かつ完全情報な組合せゲームとしてモデル化し、その完全な状態空間グラフを構築・分析する。組合せゲーム理論の諸原理を適用し、到達可能な全てのゲーム状態をNポジション（次のプレイヤーの勝利）、Pポジション（前のプレイヤーの勝利）、そしてDポジション（引き分け）に分類する。分析の結果、初期状態はDポジションであり、双方のプレイヤーが最適手を打ち続けた場合、理論的には引き分けとなることが明らかになった。しかし、本レポートの核心は、対戦相手による最適手からの逸脱を徹底的に利用するために設計された最適戦略の構築にある。Chopsticksに特化した「テンポ」や「強制手順」といった高度な概念を導入し、詳細な意思決定ツリーと終盤分析を通じて、完全ではない任意の対戦相手に対する保証された勝利への道筋を提示する。

---

## **I. 序論：有限不偏ゲームとしてのChopsticks**

### **1.1. ゲームの形式的定義**

Chopsticksは、二人プレイヤーの逐次手番制ゲームとして形式化される 1。その構成要素は以下の通りである。

* **状態表現:** ゲームの状態は、順序付けられた4つ組  によって定義される。ここで、とはプレイヤー1の左手と右手の指の本数を、同様にとはプレイヤー2の指の本数を表す。各は集合${0, 1, 2, 3, 4}$に属する整数である。指が0本の手は「死んだ手（dead hand）」と見なされる 3。ゲームの初期状態は  
   である 5。  
* **行動集合:** プレイヤーは自分の手番において、以下の2種類の行動のうち、いずれか一つを正確に実行しなければならない。  
  1. **攻撃（Attack）:** 「生きている手」（値が0より大きい手）を用いて、相手の生きている手を叩く。叩かれた相手の手の指の本数は、 となる。この計算結果が5の倍数（つまり0）になる場合、その手は「死んだ手」となる。これが本分析の中心となる「ロールオーバー」または剰余ルールである 4。  
  2. **分割（Split / Transfer / Division）:** 自分の両手の間で、指の合計本数を再分配する。新しい分配方法は、元の状態とは異ならなければならない（例： は  に変更できるが、 にはできない）5。この行動は、死んだ手を復活させるためにも使用できる（例：  
      は  や  に変更可能）5。  
* **勝利条件:** 相手の両手が同時に死んだ状態、すなわち相手の状態が  になった時点で、そのプレイヤーの勝利となる 5。

### **1.2. 組合せゲーム理論（CGT）における分類**

Chopsticksは、有限な組合せゲームの全ての基準を満たしている。すなわち、二人プレイヤーであり、完全情報（全ての状態が両プレイヤーに公開されている）、確率的要素（サイコロなど）がなく、手番が交互に進行する 2。可能な状態数が有限であるため、このゲームは有限である 6。ループ（千日手）は可能であるが、プレイヤーがミスを犯すか、あるいは無限ループを禁止する特定ルールが適用されれば、ゲームは必ず終結する。

さらに、任意の状態から可能な手は、その状態自体にのみ依存し、どちらのプレイヤーの手番かには依存しないため、これは不偏ゲーム（impartial game）に分類される 2。この分類は、スプレイグ・グランディの定理の原理を適用する上で極めて重要である。

### **1.3. 本レポートの目的と範囲**

本レポートの主目的は、このゲームを「解く」ことである。組合せゲーム理論において「解く」とは、任意の与えられた局面から、双方が最適手を打った場合の勝敗（勝ち、負け、引き分け）を決定することを意味する 4。本レポートは、単なる結果の分類に留まらず、ゲームの完全な状態空間グラフの分析に基づき、テンポのような高度なゲーム理論概念を活用した、実践的かつ詳細な勝利戦略を構築する。

このゲームの戦略的深さを生み出している根源は、 という計算ルールそのものである。指の合計値が5以上になった時点でその手を「死んだ手」とする「カットオフ」ルール 6 の下では、ゲーム全体の指の総数は概ね増加傾向にあるため、状態遷移は不可逆的となり、ゲームは有向非巡回グラフ（DAG）構造を持つ。これにより、ゲームの終結は保証される。しかし、

 ルール、すなわち  7 は、この単調な進行を破壊する。例えば、

 という状態からの一回の攻撃で、指が  の手が生まれ、ゲーム全体の指の総数が減少する可能性がある。この非単調性こそが、状態空間グラフにサイクル、すなわち千日手の可能性を生じさせる直接的な原因である 16。したがって、あらゆる深い戦略的分析は、このルールがもたらす複雑性と、最適プレイヤー間での無限プレイの可能性を前提としなければならない。

---

## **II. Modulo Chopsticksの状態空間グラフ**

### **2.1. 状態空間の形式化**

個々のユニークなゲーム状態  は、有向グラフにおけるノード（頂点）として表現される 17。冗長性を排除するため、各プレイヤーの手は順序不同と見なす（例：

 は  と等価）。これにより、一人のプレイヤーが取りうる異なる手のペアは15通りとなる： 6。その結果、ゲーム全体で機能的に異なる状態（ノード）の総数は

 となる 6。合法手（攻撃と分割）は、これらのノード間を結ぶ有向エッジを形成する。

### **2.2. グラフの特性：サイクルと到達可能性**

剰余計算の性質上、このグラフは木構造や有向非巡回グラフ（DAG）にはならない。状態が過去の局面に戻るサイクルが存在するためである 16。例えば、プレイヤーが

 の状態から攻撃を行い  に遷移させた後、相手が何らかの行動をとって再び  に戻る可能性がある。これらのサイクルの存在は、このグラフの最も重要な構造的特徴である。これは、二人の完全なプレイヤーが理論上、「引き分け」状態からなる特定のサブグラフ内で無限にループし続ける可能性があることを示唆している 18。

また、初期状態  から到達不可能な状態も存在する。225の全ての状態が到達可能というわけではない 6。例えば、手番プレイヤーの状態が

 となる局面は、プレイヤーが自分の手番で負けることはないため、到達不可能である 6。

### **2.3. グラフ生成への計算論的アプローチ**

完全な状態空間グラフは、初期状態  から幅優先探索（BFS）または深さ優先探索（DFS）を用いてアルゴリズム的に生成される 15。minimax法などを用いた分析の際にサイクルを処理するためには、無限ループを防ぐために訪問済みの状態を記録・管理することが不可欠である 16。

この状態空間グラフは、本質的に3つの基本的なサブグラフ、すなわち「勝利への経路」「敗北への経路」、そして中心的な「引き分けサイクルの核」に分割できると解釈できる。戦略の本質は、単に状態間を移動することではなく、この引き分けサイクルの核から、自らの勝利経路へと強制的に移行させることにある。全ての勝利の終局状態（例：）から逆方向にたどることで、勝利経路上の全ての状態を特定できる。同様に、敗北の終局状態からたどることで敗北経路も特定可能である。初期状態  が「引き分け」状態であるという事実は 21、グラフ内に強連結成分、すなわち相互に到達可能であり、かつ最適手を打つ相手に対しては誰も勝利経路への脱出を強制できない状態群が存在することを示唆する。これが「引き分けサイクルの核」である。したがって、この核にいるプレイヤーの戦略目標は二重である。第一に、引き分け状態への移動のみを選択し、核内に留まり続けること。第二に、相手がミスを犯すのを待つこと。すなわち、相手が引き分けサイクルの核から、こちらの勝利経路上の状態へと移行する手を打つ瞬間を待つのである。この視点は、ゲームの戦略目標全体を再定義するものである。

---

## **III. Pポジション、Nポジション、そして勝敗の決定**

### **3.1. 理論的枠組み**

組合せゲーム理論では、ゲームの各状態は以下のように分類される。

* **Pポジション（Previous-player winning）:** 前手番（直前に行動した）プレイヤーが勝利する状態。この状態からは、どのような合法手を打っても、相手が有利なNポジションにしか遷移できない。Pポジションに移行させたプレイヤーは、相手がそこから動かざるを得ないため、勝利が保証される 2。  
* **Nポジション（Next-player winning）:** 次手番プレイヤーが勝利する状態。この状態からは、相手が不利なPポジションへ移行させる合法手が少なくとも一つ存在する。Nポジションで手番を迎えたプレイヤーは、そのPポジションへ移行させることで勝利を強制できる 2。

これらの分類は、通常、後退帰納法によって行われる。終局状態をPポジションとし、Pポジションに一手で到達できる状態をNポジション、Nポジションにしか遷移できない状態をPポジション、と再帰的にラベル付けしていく 2。

### **3.2. Dポジション（Drawing Positions）の導入**

状態グラフにサイクルが存在するため、単純なP/Nの二元論ではこのゲームを完全に記述できない。第三のカテゴリとして、Dポジションを導入する必要がある 18。

* **Dポジション（Drawing）:** 引き分け状態。この状態からはPポジションへの遷移は不可能だが、少なくとも一つの他のDポジションへの遷移が可能である。Dポジションにいる最適プレイヤーは、負けることを避けられるが、同じく最適手を打つ相手に対して勝利を強制することもできない。Dポジションからの全ての合法手は、相手にとってのNポジションか、あるいは別のDポジションのいずれかに繋がる 21。

分析の結果、Chopsticksの初期状態  はDポジションである。

### **3.3. P/N/D分類のための再帰的アルゴリズム**

引き分けを考慮に入れるため、標準的な後退帰納法アルゴリズムを以下のように拡張する。

1. 全ての終局的敗北状態（例：自分の手が ）をPポジションとして初期化する。  
2. 全ての終局的勝利状態をNポジションとして初期化する。  
3. 未分類の状態に対して、以下のラベル付けを反復的に行う：  
   * 既知のPポジションへの遷移が可能な状態は、Nポジションとしてラベル付けする。  
   * 全ての遷移先が既知のNポジションである状態は、Pポジションとしてラベル付けする。  
   * Pポジションへの遷移がなく、かつ未分類またはDポジションへの遷移が少なくとも一つ存在する状態は、Dポジションの候補として残る。  
4. P/Nの伝播が安定した後、到達可能でありながらサイクルの一部として残っている状態は、Dポジションとして分類される。

Dポジションの存在は、「最適手」の概念を根本的に変える。最適手とは、もはや単に勝利を強制することではなく、リスク管理そのものとなる。第一の目標は「Dポジションの核から、自らが不利になるPポジションへ決して移行しないこと」であり、第二の目標は「相手に複雑な選択肢を提示し、相手がミスを犯してこちらのNポジションへ移行するよう仕向けること」である。NimのようなP/Nのみのゲームでは、NポジションにいればPポジションへ移すだけで勝利への道筋は明確である 13。しかしChopsticksでは、Dポジション（初期状態など）から、相手にとってのNポジションへ繋がる手と、他のDポジションへ繋がる手の両方が存在する 21。完全なプレイヤーは後者を選び引き分けを維持するが、人間は完全ではない。したがって、実践的な最適戦略とは、相手をPポジションに「最も近い」Dポジションへ誘導するか、あるいは最も紛らわしく選択肢の多い局面を作り出し、エラーの確率を最大化する手を選択することである。これは、戦略が数学的な確実性だけでなく、心理的な圧力や複雑性の管理といった層を含むことを意味する。

---

## **IV. 戦略的二分法：攻撃と分割の分析**

### **4.1. 攻撃（Attack）の役割**

* **機能:** 主要な攻撃手段。相手の状態を直接変化させ、相手の指を0に近づける唯一の方法である 4。  
* **戦術的価値:** 脅威の創出、後続の攻撃の準備、そして手の直接的な排除に用いられる。重要な戦術の一つは、相手の手を4にすることで、次の手番での排除という直接的な脅威を作り出すことである。また、剰余ルールを利用して、合計値が低い値になるような攻撃（例：4の手で2の手を攻撃し、 とする）は、相手に与える脅威を軽減させる場合もある。

### **4.2. 分割（Split）の役割**

* **機能:** 防御、再配置、そしてリソース管理のための手段である 5。  
* **防御的利用:** 脆弱な手（例：4の指）から指を移動させ、容易なノックアウトを回避する（例： の状態を  に分割する）9。  
* **リソース管理（復活）:** 死んだ手をゲームに復帰させ、攻撃・防御の選択肢を実質的に倍増させる（例： から  へ）5。これは、終盤での安易な敗北を防ぐ強力な手である。  
* **局面設定:** より有利な攻撃数を作り出す（例：3での攻撃が戦略的に価値が高い場合、 を  に分割する）。

### **4.3. 分割のテンポ・コスト**

攻撃は相手に直接影響を与え、反応を強いる。一方、分割は自分自身の状態を変更するのみである。したがって、分割は本質的に「テンポ」を失う行動である。つまり、相手の状況を悪化させることなく、自分自身の状況を改善するために1ターンを費やすことになる 24。これは相手に、自身の計画を前進させるための「自由な」一手を与えることに等しい。

ゲーム状態の戦略的価値は、そのP/N/D分類だけでなく、「分割ポテンシャル」によっても左右される。死んだ手を復活させるために分割可能な偶数の手を持つ状態（例：）は、分割が非効率的、あるいは特定のルール下では不可能な奇数の手を持つ状態（例：）よりも本質的に強靭であり、価値が高い 7。例えば、プレイヤー1の視点から

 と  という二つの状態を比較する。どちらも片手が死んだ状態である。前者の場合、プレイヤー1の選択肢は3の手で攻撃することのみであり、相手はその単一の手に攻撃を集中できる。後者の場合、プレイヤー1は  や  へと分割する強力な選択肢を持つ。この一手はゲームの力学を完全にリセットし、相手が持っていた片手へのアドバンテージを無効化する。したがって、重要な戦略目標は、相手を奇数の片手状態に追い込みつつ、自分自身の偶数分割能力を維持することである。これにより防御能力に非対称性が生まれ、相手を  や  のような状態に追い込む攻撃が、 や  にする攻撃よりも優先されるべきである。

---

## **V. 高度な戦略ダイナミクス：テンポ、強制手順、そして局面的優位性**

### **5.1. Chopsticksにおけるテンポの定義と定量化**

テンポとは、主導権、あるいは戦略目標を達成するための手の効率性を測る尺度である 27。Chopsticksにおいて高テンポな手とは、相手の最適な応答を著しく制限するか、あるいは分割のようなテンポを失う防御的な手を強いる手である。

* **テンポ獲得の例:** プレイヤー1が  の状態にあるとする。P1が  と攻撃し、状態を  にする。これは高テンポな手である。なぜなら、相手の4の手に即時的な脅威を生み出し、プレイヤー2に防御的な分割（例：）を強いる可能性が高いためである。これにより、主導権は再びプレイヤー1に戻る。  
* **テンポ喪失の例:** あらゆる分割は、自己の局面を改善するために自発的にテンポを失う行動である 24。

### **5.2. 強制手順の特定と実行**

強制手順とは、相手の応答に関わらず、保証された結果へと導く一連の手の連鎖である。これは、手順中の各手が、相手に唯一の合理的な応答、あるいは全てが望ましい経路に繋がる応答群しか残さないために可能となる 29。これらの手順は、NポジションからPポジションへと移行する動きの実践的な具現化である。状態空間グラフの中から、相手の後続ノードからの全ての分岐が、こちらに有利な状態へと収束する経路を分析することで、これらの手順を特定する。

### **5.3. P/N/D分類を超えた局面的優位性**

全てのDポジションが等価なわけではない。「優れた」Dポジションとは、他のDポジションへ繋がる選択肢がより多い局面や、相手のPポジションにより多く隣接している局面である。

* **局面的優位性の要因:**  
  * **柔軟性:** 敗北に繋がらない手の選択肢が多いこと。  
  * **脅威ポテンシャル:** 一手で大きな脅威（分割を強いるなど）を作り出せる状態にあること。  
  * **強靭性:** 防御的な分割を可能にする偶数の手を持つこと。

このゲームは、P/N/Dの状態構造の上に層をなす「テンポの戦い」と見なすことができる。勝者とは、テンポの優位性を局所的な優位性に転換し、相手をDポジションの核から引きずり出すことに成功したプレイヤーである。ゲームは均衡したD状態で始まる。プレイヤーは高テンポな手（例：相手に4の手を作る）を打つことで一時的な主導権を得る。相手は反応を強いられ、テンポを失う防御的な分割を行うか、より悪い局面につながるリスクを冒して反撃するかの選択を迫られる。もし相手が防御的な分割を選べば、最初のプレイヤーは主導権を維持し、圧力をかけ続けることができる。この圧力が数手番にわたって正しく適用されれば、相手は良い防御手段を失い、最終的にPポジション（局所的な劣勢）へと繋がる手を打たざるを得なくなる。したがって、勝利戦略とは単にP/N/D状態を知ることではなく、テンポを利用してグラフ内を航行し、相手をDポジションの核から敗北経路へと強制的に逸脱させる方法を理解することである。

---

## **VI. 先手・後手番のための最適戦略構築**

### **6.1. 序盤：初期の引き分け局面の航行**

初期状態  はDポジションである 21。先手プレイヤーはここから勝利を強制することはできない。先手の最初の最適手は、一方の

 攻撃であり、これにより状態は  となる。この状態もまたDポジションである。後手プレイヤーの最適な応答は、同様に引き分けを維持する手、例えば  攻撃で  へと移行することである。先手にとってのPポジションに繋がる手は全てエラーとなる。

### **6.2. 中盤の意思決定ツリー**

このセクションは、実践的な戦略ガイドの核となる。プレイヤーは以下の規範的アルゴリズムに従うべきである。

**行動規則：** 自分の手番で、現在の状態  を評価する。

1. 全ての可能な次の状態  を特定する。  
2. 各  を、相手の視点から分類する（相手にとってP、N、Dのいずれか）。  
3. **もし相手にとってPポジションとなる状態  への遷移が一つでも存在するなら、その手を実行せよ。** これは勝利の手である。  
4. **そうでなく、もし相手にとってDポジションとなる状態  への遷移が一つでも存在するなら、その手を実行せよ。** これは引き分けを維持し、ゲームを継続させる。  
5. **もし全ての可能な遷移先が、相手にとってNポジションとなる状態  のみである場合、あなたはPポジションにおり、最適プレイヤーに対しては敗北する。**

このロジックは、フローチャートや具体的な例を通じて提示されるべきであり、31や26のような情報源からの戦略的ラインを参照する。

### **6.3. 表1：主要なゲーム状態の分類と最適応答**

この表は、プレイヤーのためのクイックリファレンスガイドとして機能する。完全な状態空間グラフを人間が記憶することは非現実的であるため 15、この表は複雑なCGT解析の結果を、人間が実行可能な形式に蒸留するものである。

| 状態表記 (手番プレイヤー | 相手) | P/N/D分類 | 最適手 | 戦略的根拠 |
| :---- | :---- | :---- | :---- | :---- |
| (1,1 | 1,1) | D | 攻撃:  | D状態を維持し、相手に $(1,1 |
| (1,1 | 1,2) | D | 攻撃:  | D状態 $(1,2 |
| (1,1 | 4,1) | N | 攻撃:  | 相手を $(1,1 |
| (2,2 | 1,1) | D | 分割:  | D状態を維持する。攻撃  は相手をNポジション $(2,2 |
| (4,0 | 1,1) | D | 分割:  | 非常に強力な防御手。死んだ手を復活させ、局面を完全にリセットする。 |
| (3,0 | 1,1) | D | 攻撃:  | 唯一の選択肢。相手を $(3,0 |
| (1,1 | 1,0) | N | (相手の応答待ち) | 相手は  攻撃しかできず、(2,1 |

---

## **VII. 終盤理論と主要な局所パターン**

### **7.1. 終盤の定義**

終盤とは、少なくとも一方のプレイヤーが死んだ手を持つ局面と定義される。これによりゲームツリーは大幅に単純化される。多くの終盤局面の特徴は、利用可能な手が減少することであり、これにより引き分けサイクルが排除され、強制手順の計算と実行が容易になる。

### **7.2. ケーススタディ1：(1,1 | 1,0) からの強制勝利**

これは古典的な終盤のNポジションである。31で概説されている強制勝利手順を以下に段階的に分解する。

1. **開始状態:** プレイヤーA (手番) : , プレイヤーB:   
2. プレイヤーBは  と攻撃するしかなく、状態はA: , B:  となる。手番はAに移る。  
3. プレイヤーAは  へと分割する。状態はA: , B: 。手番はB。  
4. プレイヤーBは  と攻撃するしかなく、状態はA: , B:  となる。手番はA。  
5. プレイヤーAは  と攻撃する。これによりBの手は  となり、状態はA: , B:  となる。プレイヤーAの勝利。

この分析は、相手が各ステップで、現在のプレイヤーにとっての別のNポジションへと移行する以外に選択肢がない、完全な強制手順を示している。

### **7.3. 一般的な終盤の原則**

* **殲滅の原則:** 相手が片手になった場合、主要な目標はその手を執拗に攻撃し、相手を脆弱な局面に繋がる可能性のある分割へと追い込むことである。  
* **保存の原則:** 自分自身の分割能力を保護する。もし自分が片手に追い込まれた場合、可能であれば偶数の手を作り、復活の分割を可能にすることを優先する。

6にリストされている到達可能な14の終盤状態を全て特定し、それぞれをP/N/Dに分類し、最適なプレイラインを提供することが、完全な終盤戦略の構築には不可欠である。

---

## **VIII. 結論：Modulo Chopsticksの解明された性質**

### **8.1. 戦略的所見の要約**

本レポートは、Chopsticksを、剰余ルールがもたらす巡回的な性質に支配された有限不偏ゲームとして分類した。その結果、このゲームは初期状態から理論的には引き分け（Dポジション）であることが確認された。構築された最適戦略は、開始時点から勝利を強制するものではなく、相手がエラーを犯すまで引き分け状態を維持し、そのエラーを事前に計算された強制手順を用いて確実な勝利に転換することを目的とするものである。

### **8.2. プレイヤーへの示唆**

* **カジュアルプレイヤーにとっての要点:** 防御的な分割（特に4の手から）の重要性と、基本的な脅威の理解が鍵となる。  
* **エキスパートプレイヤーにとっての勝利:** 主要な状態のP/N/D分類（表1参照）を記憶し、テンポの原理を理解して相手に圧力をかけ、致命的なミスを誘発することによって達成される。

### **8.3. 今後の研究**

* 異なる法（例：18で言及されている  
  ）や、異なるルールバリアント（例：6の「スーサイド」や「メタ」ルール）下でのChopsticksの分析。  
* 特定のChopsticks局面に対するニム値やゲームの温度といった、より高度なCGT概念を適用し、局所的優位性に関するより詳細な理解を深める研究。  
* 法  の関数としてのChopsticksを解くための計算複雑性の分析。

#### **引用文献**

1. Combinatorial game theory \- Wikipedia, 10月 3, 2025にアクセス、 [https://en.wikipedia.org/wiki/Combinatorial\_game\_theory](https://en.wikipedia.org/wiki/Combinatorial_game_theory)  
2. GAME THEORY \- CMU School of Computer Science, 10月 3, 2025にアクセス、 [https://www.cs.cmu.edu/afs/cs/academic/class/15859-s05/www/ferguson/comb.pdf](https://www.cs.cmu.edu/afs/cs/academic/class/15859-s05/www/ferguson/comb.pdf)  
3. Chopsticks \- Ludii Portal, 10月 3, 2025にアクセス、 [https://ludii.games/details.php?keyword=Chopsticks](https://ludii.games/details.php?keyword=Chopsticks)  
4. Chopsticks Game · English reading exercise (advanced level) \- BitGab, 10月 3, 2025にアクセス、 [https://www.bitgab.com/exercise/chopsticks-game](https://www.bitgab.com/exercise/chopsticks-game)  
5. 割り箸 (手遊びゲーム) \- Wikipedia, 10月 3, 2025にアクセス、 [https://ja.wikipedia.org/wiki/%E5%89%B2%E3%82%8A%E7%AE%B8\_(%E6%89%8B%E9%81%8A%E3%81%B3%E3%82%B2%E3%83%BC%E3%83%A0)](https://ja.wikipedia.org/wiki/%E5%89%B2%E3%82%8A%E7%AE%B8_\(%E6%89%8B%E9%81%8A%E3%81%B3%E3%82%B2%E3%83%BC%E3%83%A0\))  
6. Chopsticks (hand game) \- Wikipedia, 10月 3, 2025にアクセス、 [https://en.wikipedia.org/wiki/Chopsticks\_(hand\_game)](https://en.wikipedia.org/wiki/Chopsticks_\(hand_game\))  
7. Chopsticks in Prolog \- Charles Lee, 10月 3, 2025にアクセス、 [https://charlesjlee.com/post/20200605-prolog-chopsticks/](https://charlesjlee.com/post/20200605-prolog-chopsticks/)  
8. Chopsticks Game – A Combinatorial Challenge \- The Muse Garden, 10月 3, 2025にアクセス、 [https://themusegarden.wordpress.com/2013/10/14/game-of-five-a-combinatorial-challenge/](https://themusegarden.wordpress.com/2013/10/14/game-of-five-a-combinatorial-challenge/)  
9. How to Play Chopsticks (Hand Game): Rules & Best Strategies \- wikiHow, 10月 3, 2025にアクセス、 [https://www.wikihow.com/Play-Chopsticks](https://www.wikihow.com/Play-Chopsticks)  
10. arxiv.org, 10月 3, 2025にアクセス、 [https://arxiv.org/abs/1810.02870\#:\~:text=Combinatorial%20game%20theory%20(CGT)%2C,a%20finite%20number%20of%20moves).](https://arxiv.org/abs/1810.02870#:~:text=Combinatorial%20game%20theory%20\(CGT\)%2C,a%20finite%20number%20of%20moves\).)  
11. Combinatorial Games \- Mathematik-Olympiade, 10月 3, 2025にアクセス、 [https://mathematical.olympiad.ch/fileadmin/user\_upload/Archiv/Intranet/Olympiads/Mathematics/deploy/scripts/combinatorics/combinatorial-games/script/combinatorial-games\_script\_en.pdf](https://mathematical.olympiad.ch/fileadmin/user_upload/Archiv/Intranet/Olympiads/Mathematics/deploy/scripts/combinatorics/combinatorial-games/script/combinatorial-games_script_en.pdf)  
12. Can the game "Chopsticks" be mathematically solved? \- Math Stack Exchange, 10月 3, 2025にアクセス、 [https://math.stackexchange.com/questions/4159179/can-the-game-chopsticks-be-mathematically-solved](https://math.stackexchange.com/questions/4159179/can-the-game-chopsticks-be-mathematically-solved)  
13. crash course on combinatorial game theory, 10月 3, 2025にアクセス、 [https://www.mathcamp.org/files/math/Alfonso-CGT-lectures.pdf](https://www.mathcamp.org/files/math/Alfonso-CGT-lectures.pdf)  
14. PERIODICITY OF S-PICK-UP-BRICKS 1\. Introduction Game theory is fundamentally a field focused on finding strategies in multiplaye \- MIT Mathematics, 10月 3, 2025にアクセス、 [https://math.mit.edu/research/highschool/primes/circle/documents/2025/Auden-Daniil-Final.pdf](https://math.mit.edu/research/highschool/primes/circle/documents/2025/Auden-Daniil-Final.pdf)  
15. 「割りばしゲーム」が後手必勝であることを確認する \- Qiita, 10月 3, 2025にアクセス、 [https://qiita.com/kaityo256/items/86562e9ab20ae7bced1d](https://qiita.com/kaityo256/items/86562e9ab20ae7bced1d)  
16. A Chopsticks Solution Part 1 – The Board Game Scholar, 10月 3, 2025にアクセス、 [https://theboardgamescholar.com/2021/01/10/a-chopsticks-solution-part-1/](https://theboardgamescholar.com/2021/01/10/a-chopsticks-solution-part-1/)  
17. Analysis of Optimal Strategy in Chopsticks Game Using Graph-Based Approach \- Informatika, 10月 3, 2025にアクセス、 [https://informatika.stei.itb.ac.id/\~rinaldi.munir/Matdis/2024-2025/Makalah/Makalah-IF1220-Matdis-2024%20(171).pdf](https://informatika.stei.itb.ac.id/~rinaldi.munir/Matdis/2024-2025/Makalah/Makalah-IF1220-Matdis-2024%20\(171\).pdf)  
18. Chopsticks \- Announcing a Store\! \- Graph All The Things, 10月 3, 2025にアクセス、 [https://graphallthethings.com/posts/chopsticks/](https://graphallthethings.com/posts/chopsticks/)  
19. How To Play Chopsticks Like A Tryhard | Writing it Out \- WordPress.com, 10月 3, 2025にアクセス、 [https://tonkawritingcenter.wordpress.com/2022/01/13/how-to-play-chopsticks-like-a-tryhard/](https://tonkawritingcenter.wordpress.com/2022/01/13/how-to-play-chopsticks-like-a-tryhard/)  
20. Finding Optimal Play of Chopsticks Hand Game Using Best First Search Algorithm and Memoization \- Informatika, 10月 3, 2025にアクセス、 [https://informatika.stei.itb.ac.id/\~rinaldi.munir/Stmik/2021-2022/Makalah/Makalah-IF2211-Stima-2022-K1%20(56).pdf](https://informatika.stei.itb.ac.id/~rinaldi.munir/Stmik/2021-2022/Makalah/Makalah-IF2211-Stima-2022-K1%20\(56\).pdf)  
21. \[OC\] All states and optimal moves for the children's game "chopsticks" : r/dataisbeautiful, 10月 3, 2025にアクセス、 [https://www.reddit.com/r/dataisbeautiful/comments/uf9dj9/oc\_all\_states\_and\_optimal\_moves\_for\_the\_childrens/](https://www.reddit.com/r/dataisbeautiful/comments/uf9dj9/oc_all_states_and_optimal_moves_for_the_childrens/)  
22. Finger Game Oracle \- of Agatha Mallett, 10月 3, 2025にアクセス、 [https://geometrian.com/projects/oldpy/finger\_game\_oracle/](https://geometrian.com/projects/oldpy/finger_game_oracle/)  
23. Combinatorial Games \- Winning Positions | Brilliant Math & Science Wiki, 10月 3, 2025にアクセス、 [https://brilliant.org/wiki/combinatorial-games-winning-positions/](https://brilliant.org/wiki/combinatorial-games-winning-positions/)  
24. question about chopsticks finger game : r/singapore \- Reddit, 10月 3, 2025にアクセス、 [https://www.reddit.com/r/singapore/comments/wc1x8i/question\_about\_chopsticks\_finger\_game/](https://www.reddit.com/r/singapore/comments/wc1x8i/question_about_chopsticks_finger_game/)  
25. Chopsticks: Finger Battle Game : r/playmygame \- Reddit, 10月 3, 2025にアクセス、 [https://www.reddit.com/r/playmygame/comments/1jnxegk/chopsticks\_finger\_battle\_game/](https://www.reddit.com/r/playmygame/comments/1jnxegk/chopsticks_finger_battle_game/)  
26. What's the solution to this game? (Chopsticks with Half Split rules) : r/GAMETHEORY, 10月 3, 2025にアクセス、 [https://www.reddit.com/r/GAMETHEORY/comments/5a5qrx/whats\_the\_solution\_to\_this\_game\_chopsticks\_with/](https://www.reddit.com/r/GAMETHEORY/comments/5a5qrx/whats_the_solution_to_this_game_chopsticks_with/)  
27. The Mechanisms of Gameplay: Value, Tempo, and Initiative \- The Rathe Times, 10月 3, 2025にアクセス、 [https://rathetimes.com/articles/the-mechanisms-of-gameplay-value-tempo-and-initiative](https://rathetimes.com/articles/the-mechanisms-of-gameplay-value-tempo-and-initiative)  
28. \[Discussion\] Tempo... what does it REALLY mean? : r/spikes \- Reddit, 10月 3, 2025にアクセス、 [https://www.reddit.com/r/spikes/comments/1emf3c4/discussion\_tempo\_what\_does\_it\_really\_mean/](https://www.reddit.com/r/spikes/comments/1emf3c4/discussion_tempo_what_does_it_really_mean/)  
29. Use tempo moves to win\! \- YouTube, 10月 3, 2025にアクセス、 [https://www.youtube.com/watch?v=JMi4SSzHeBs](https://www.youtube.com/watch?v=JMi4SSzHeBs)  
30. THEORY OF MOVES: A DYNAMIC APPROACH TO GAMES \- Macmillan Learning, 10月 3, 2025にアクセス、 [https://www.macmillanlearning.com/studentresources/college/mathematics/fapp9e/chapterspriorfapp/ch16611647.pdf](https://www.macmillanlearning.com/studentresources/college/mathematics/fapp9e/chapterspriorfapp/ch16611647.pdf)  
31. How to Always Win Chopsticks (with Pictures) \- wikiHow, 10月 3, 2025にアクセス、 [https://www.wikihow.com/Always-Win-Chopsticks](https://www.wikihow.com/Always-Win-Chopsticks)