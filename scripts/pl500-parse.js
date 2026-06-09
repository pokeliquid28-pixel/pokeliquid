#!/usr/bin/env node
// Parse the PL500 card list and calculate index value
// Then look up TCGPlayer product IDs via search API

const raw = `1. ME04: Chaos RisingSpecial Illustration Rare, #116/086Mega Greninja ex - 116/086|$351.51
2. ME02: Phantasmal FlamesSpecial Illustration Rare, #125/094Mega Charizard X ex - 125/094|$871.70
3. SV: Scarlet & Violet 151Special Illustration Rare, #199/165Charizard ex - 199/165|$466.81
4. ME: Ascended HeroesSpecial Illustration Rare, #276/217Pikachu ex - 276/217|$1,290.03
5. ME: Ascended HeroesSpecial Illustration Rare, #284/217Mega Gengar ex - 284/217|$1,330.20
6. SV: Paldean FatesSpecial Illustration Rare, #232/091Mew ex - 232/091|$958.91
7. ME: Ascended HeroesSpecial Illustration Rare, #290/217Mega Dragonite ex - 290/217|$876.23
8. SV: Prismatic EvolutionsSpecial Illustration Rare, #161/131Umbreon ex - 161/131|$1,557.92
9. ME: Mega Evolution PromoPromo, #038Charmander - 038|$42.90
10. ME: Ascended HeroesIllustration Rare, #226/217Psyduck - 226/217|$115.62
11. ME03: Perfect OrderSpecial Illustration Rare, #121/088Meowth ex - 121/088|$198.75
12. ME03: Perfect OrderIllustration Rare, #094/088Clefairy - 094/088|$29.40
13. ME: Mega Evolution PromoPromo, #023Mega Charizard X ex - 023|$44.94
14. ME04: Chaos RisingMega Hyper Rare, #122/086Mega Greninja ex - 122/086|$299.45
15. SM - Team UpUltra Rare, #33/181Pikachu & Zekrom GX|$127.86
16. Base SetHolo Rare, #004/102Charizard|$614.49
17. JungleHolo Rare, #12/64Vaporeon (12)|$161.79
18. SWSH07: Evolving SkiesSecret Rare, #215/203Umbreon VMAX (Alternate Art Secret)|$2,181.59
19. ME: Mega Evolution PromoPromo, #037Bulbasaur - 037|$37.94
20. FossilHolo Rare, #04/62Dragonite (4)|$356.07
21. ME: Ascended HeroesMega Attack Rare, #269/217Mega Gengar ex - 269/217|$86.77
22. ME02: Phantasmal FlamesIllustration Rare, #106/094Meowth|$26.33
23. ME: Mega Evolution PromoPromo, #033Mega Lucario ex - 033|$18.66
24. Miscellaneous Cards & ProductsPromo, #1Ancient Mew|$121.27
25. ME: Mega Evolution PromoPromo, #039Squirtle - 039|$30.81
26. Neo GenesisHolo Rare, #009/111Lugia|$1,599.98
27. ME: Mega Evolution PromoPromo, #031N's Zekrom - 031|$10.60
28. SV10: Destined RivalsSpecial Illustration Rare, #231/182Team Rocket's Mewtwo ex - 231/182|$569.18
29. SWSH: Sword & Shield Promo CardsPromo, #SWSH262Charizard VSTAR - SWSH262|$96.06
30. FossilHolo Rare, #10/62Lapras (10)|$104.95
31. SV: Scarlet & Violet 151Special Illustration Rare, #200/165Blastoise ex - 200/165|$163.00
32. ME02: Phantasmal FlamesMega Hyper Rare, #130/094Mega Charizard X ex - 130/094|$356.80
33. ME04: Chaos RisingIllustration Rare, #088/086Froakie - 088/086|$17.31
34. ME04: Chaos RisingSpecial Illustration Rare, #119/086Cinccino ex - 119/086|$90.53
35. JungleHolo Rare, #11/64Snorlax (11)|$354.08
36. ME03: Perfect OrderMega Hyper Rare, #124/088Mega Zygarde ex - 124/088|$172.61
37. SV: Scarlet & Violet 151Illustration Rare, #168/165Charmander - 168/165|$121.63
38. SV: Scarlet & Violet Promo CardsPromo, #053Mew ex - 053|$78.29
39. SV: Scarlet & Violet 151Special Illustration Rare, #198/165Venusaur ex - 198/165|$136.80
40. FossilHolo Rare, #05/62Gengar (5)|$254.62
41. ME04: Chaos RisingIllustration Rare, #091/086Xerneas - 091/086|$14.58
42. SWSH: Crown Zenith: Galarian GallerySecret Rare, #GG69/GG70Giratina VSTAR (Secret)|$387.28
43. SV: Scarlet & Violet Promo CardsPromo, #044Charmander - 044|$69.56
44. SWSH08: Fusion StrikeSecret Rare, #271/264Gengar VMAX (Alternate Art Secret)|$944.49
45. ME04: Chaos RisingIllustration Rare, #090/086Ampharos - 090/086|$14.33
46. SV02: Paldea EvolvedIllustration Rare, #203/193Magikarp - 203/193|$403.10
47. ME: Ascended HeroesSpecial Illustration Rare, #277/217Pikachu ex - 277/217|$462.64
48. FossilHolo Rare, #02/62Articuno (2)|$206.32
49. SWSH12: Silver TempestUltra Rare, #186/195Lugia V (Alternate Full Art)|$514.04
50. JungleCommon, #60/64Pikachu|$28.58
51. ME: Ascended HeroesMega Attack Rare, #271/217Mega Dragonite ex - 271/217|$58.28
52. Celebrations: Classic CollectionClassic Collection, #4/102Charizard|$208.82
53. SV: Scarlet & Violet 151Illustration Rare, #170/165Squirtle - 170/165|$116.52
54. SV: Scarlet & Violet 151Special Illustration Rare, #202/165Zapdos ex - 202/165|$118.62
55. ME04: Chaos RisingIllustration Rare, #089/086Frogadier - 089/086|$14.70
56. SV: Scarlet & Violet 151Illustration Rare, #173/165Pikachu - 173/165|$99.10
57. SV03: Obsidian FlamesSpecial Illustration Rare, #223/197Charizard ex - 223/197|$141.18
58. JungleHolo Rare, #05/64Kangaskhan (5)|$79.07
59. SV: Prismatic EvolutionsSpecial Illustration Rare, #156/131Sylveon ex - 156/131|$501.86
60. ME03: Perfect OrderSpecial Illustration Rare, #120/088Mega Zygarde ex - 120/088|$71.46
61. CelebrationsHolo Rare, #005/025Pikachu|$8.50
62. ME04: Chaos RisingUltra Rare, #100/086Mega Greninja ex - 100/086|$25.02
63. Celebrations: Classic CollectionClassic Collection, #17/17Umbreon Star|$121.80
64. ME: Ascended HeroesMega Hyper Rare, #294/217Mega Charizard Y ex - 294/217|$649.12
65. SM - Team UpUltra Rare, #170/181Latias & Latios GX (Alternate Full Art)|$2,474.95
66. SV10: Destined RivalsSpecial Illustration Rare, #232/182Cynthia's Garchomp ex - 232/182|$289.10
67. SV: Scarlet & Violet Promo CardsPromo, #132Greninja ex - 132|$127.34
68. Neo GenesisHolo Rare, #012/111Pichu|$330.45
69. SV: Scarlet & Violet Promo CardsPromo, #052Mewtwo - 052|$52.11
70. SV: Scarlet & Violet Promo CardsPromo, #173Eevee - 173|$15.48
71. SWSH: Sword & Shield Promo CardsPromo, #SWSH144Greninja Star|$31.22
72. ME: Mega Evolution PromoPromo, #042Piplup - 042|$14.69
73. ME: Mega Evolution PromoPromo, #042Piplup - 042|$14.71
74. XY - EvolutionsHolo Rare, #11/108Charizard|$102.72
75. ME01: Mega EvolutionSpecial Illustration Rare, #179/132Mega Lucario ex - 179/132|$242.88
76. ME: Ascended HeroesSpecial Illustration Rare, #281/217Team Rocket's Mewtwo ex - 281/217|$459.31
77. ME: Ascended HeroesSpecial Illustration Rare, #286/217N's Zoroark ex - 286/217|$192.74
78. ME04: Chaos RisingSpecial Illustration Rare, #118/086Mega Dragalge ex - 118/086|$62.52
79. SV: Scarlet & Violet Promo CardsPromo, #051Snorlax - 051|$21.38
80. ME01: Mega EvolutionSpecial Illustration Rare, #177/132Mega Venusaur ex - 177/132|$181.98
81. SV10: Destined RivalsIllustration Rare, #193/182Misty's Psyduck - 193/182|$79.65
82. Team RocketHolo Rare, #05/82Dark Dragonite (5)|$351.92
83. Base SetHolo Rare, #002/102Blastoise|$229.23
84. JungleHolo Rare, #04/64Jolteon (4)|$207.75
85. ME: Mega Evolution PromoPromo, #024Oricorio ex - 024|$14.49
86. Base Set (Shadowless)Common, #044/102Bulbasaur|$262.36
87. Celebrations: Classic CollectionClassic Collection, #24/53______'s Pikachu|$46.44
88. SV10: Destined RivalsSpecial Illustration Rare, #230/182Ethan's Ho-Oh ex - 230/182|$191.51
89. ME01: Mega EvolutionSpecial Illustration Rare, #178/132Mega Gardevoir ex - 178/132|$201.11
90. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG44/GG70Mewtwo VSTAR|$285.28
91. Neo DiscoveryHolo Rare, #13/75Umbreon (13)|$1,500.00
92. Team RocketRare, #21/82Dark Charizard (21)|$162.67
93. XY PromosPromo, #XY124Pikachu EX - XY124|$402.10
94. Base Set (Shadowless)Holo Rare, #012/102Ninetales|$800.00
95. Base Set (Shadowless)Common, #058/102Pikachu (Red Cheeks)|$453.32
96. SV07: Stellar CrownIllustration Rare, #148/142Squirtle|$131.12
97. SWSH: Sword & Shield Promo CardsPromo, #SWSH260Charizard V - SWSH260|$59.18
98. ME03: Perfect OrderSpecial Illustration Rare, #123/088Rosa's Encouragement - 123/088|$66.41
99. FossilHolo Rare, #12/62Moltres (12)|$183.10
100. SWSH: Crown Zenith: Galarian GallerySecret Rare, #GG70/GG70Arceus VSTAR (Secret)|$254.01
101. ME02: Phantasmal FlamesUltra Rare, #109/094Mega Charizard X ex - 109/094|$34.84
102. SV07: Stellar CrownIllustration Rare, #143/142Bulbasaur|$138.57
103. ME03: Perfect OrderSpecial Illustration Rare, #118/088Mega Starmie ex - 118/088|$68.00
104. ME03: Perfect OrderDouble Rare, #062/088Meowth ex - 062/088|$3.44
105. ME04: Chaos RisingSpecial Illustration Rare, #117/086Mega Floette ex - 117/086|$51.67
106. JungleCommon, #51/64Eevee|$17.04
107. Base Set (Shadowless)Common, #046/102Charmander|$139.60
108. Miscellaneous Cards & ProductsIllustration Rare, #133/132Bulbasaur - 133/132 (Mega Evolution Stamped)|$27.06
109. Team RocketHolo Rare, #03/82Dark Blastoise (3)|$331.37
110. SV09: Journey TogetherSpecial Illustration Rare, #184/159Lillie's Clefairy ex - 184/159|$133.83
111. SV08: Surging SparksSpecial Illustration Rare, #238/191Pikachu ex - 238/191|$339.11
112. SWSH: Crown ZenithSecret Rare, #160/159Pikachu (Secret)|$52.59
113. ME: Mega Evolution PromoPromo, #032Mega Gardevoir ex - 032|$9.04
114. Gym HeroesHolo Rare, #014/132Sabrina's Gengar|$600.87
115. SM PromosPromo, #SM168Pikachu & Zekrom GX|$214.40
116. FossilHolo Rare, #15/62Zapdos (15)|$121.29
117. ME03: Perfect OrderSpecial Illustration Rare, #119/088Mega Clefable ex - 119/088|$68.46
118. SV: Scarlet & Violet 151Illustration Rare, #166/165Bulbasaur - 166/165|$89.51
119. Double CrisisUltra Rare, #6/34Team Aqua's Kyogre EX|$492.04
120. ME03: Perfect OrderUltra Rare, #113/088Poke Pad - 113/088|$14.07
121. ME02: Phantasmal FlamesIllustration Rare, #098/094Piplup - 098/094|$17.76
122. JungleHolo Rare, #03/64Flareon (3)|$158.16
123. Base SetHolo Rare, #010/102Mewtwo|$78.31
124. ME: Ascended HeroesSpecial Illustration Rare, #274/217Mega Feraligatr ex - 274/217|$186.76
125. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG10/GG70Mew|$73.03
126. Neo DestinySecret Rare, #106/105Shining Celebi|$1,801.00
127. Base Set (Shadowless)Holo Rare, #006/102Gyarados|$600.00
128. Generations: Radiant CollectionUltra Rare, #RC32/RC32Sylveon EX (Full Art)|$167.72
129. SV: Scarlet & Violet 151Illustration Rare, #169/165Charmeleon - 169/165|$79.92
130. ME: Ascended HeroesMega Hyper Rare, #295/217Mega Dragonite ex - 295/217|$331.27
131. SV06: Twilight MasqueradeACE SPEC Rare, #165/167Unfair Stamp|$15.62
132. Base Set 2Holo Rare, #004/130Charizard|$427.38
133. Base SetHolo Rare, #015/102Venusaur|$150.30
134. FossilRare, #20/62Gengar (20)|$76.91
135. ME01: Mega EvolutionUltra Rare, #169/132Lillie's Determination - 169/132|$25.70
136. ME04: Chaos RisingSpecial Illustration Rare, #120/086AZ's Tranquility - 120/086|$44.63
137. SWSH07: Evolving SkiesSecret Rare, #218/203Rayquaza VMAX (Alternate Art Secret)|$980.93
138. SM PromosPromo, #SM191Mewtwo & Mew GX - SM191|$340.62
139. FossilRare, #19/62Dragonite (19)|$85.89
140. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG30/GG70Pikachu|$53.25
141. SV08: Surging SparksSpecial Illustration Rare, #239/191Latias ex - 239/191|$193.52
142. XY - EvolutionsUltra Rare, #101/108M Charizard EX (Full Art)|$145.83
143. XY PromosPromo, #XY166M Gengar EX|$266.09
144. Team RocketHolo Rare, #04/82Dark Charizard (4)|$334.50
145. XY - Phantom ForcesUltra Rare, #114/119Gengar EX (114 Full Art)|$729.83
146. SWSH09: Brilliant StarsUltra Rare, #154/172Charizard V (Alternate Full Art)|$353.36
147. ME: Ascended HeroesSpecial Illustration Rare, #280/217Lillie's Clefairy ex - 280/217|$206.74
148. ME02: Phantasmal FlamesDouble Rare, #013/094Mega Charizard X ex - 013/094|$4.52
149. SWSH07: Evolving SkiesUltra Rare, #194/203Rayquaza V (Alternate Full Art)|$442.09
150. ME04: Chaos RisingIllustration Rare, #087/086Chespin - 087/086|$8.07
151. Double CrisisUltra Rare, #15/34Team Magma's Groudon EX|$467.06
152. SV: Scarlet & Violet 151Illustration Rare, #175/165Psyduck - 175/165|$78.29
153. Deck ExclusivesHolo Rare, #008/102Machamp - 8/102|$35.26
154. SM PromosPromo, #SM241Umbreon & Darkrai GX - SM241|$271.38
155. SV06: Twilight MasqueradeSpecial Illustration Rare, #214/167Greninja ex - 214/167|$384.13
156. SV09: Journey TogetherIllustration Rare, #161/159Articuno - 161/159|$27.38
157. SWSH11: Lost Origin Trainer GalleryUltra Rare, #TG05/TG30Pikachu|$51.53
158. SV: Scarlet & Violet 151Illustration Rare, #176/165Poliwhirl - 176/165|$62.43
159. Base SetHolo Rare, #006/102Gyarados|$51.42
160. SV: White FlareUncommon, #084/086Hilda|$2.77
161. ME: Ascended HeroesIllustration Rare, #238/217Team Rocket's Mimikyu - 238/217|$30.20
162. Gym ChallengeHolo Rare, #001/132Blaine's Arcanine|$303.69
163. XY PromosPromo, #XY69Rayquaza EX (Shiny)|$140.87
164. FossilHolo Rare, #14/62Raichu (14)|$117.84
165. FossilHolo Rare, #09/62Kabutops (9)|$103.14
166. Neo DestinyHolo Rare, #010/105Dark Typhlosion|$296.99
167. JungleHolo Rare, #10/64Scyther (10)|$133.86
168. Gym HeroesHolo Rare, #004/132Erika's Dragonair|$425.00
169. SWSH11: Lost Origin Trainer GalleryUltra Rare, #TG06/TG30Gengar|$55.64
170. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG50/GG70Darkrai VSTAR|$118.35
171. ME03: Perfect OrderSpecial Illustration Rare, #122/088Jacinthe - 122/088|$37.04
172. SV: Scarlet & Violet 151Illustration Rare, #171/165Wartortle - 171/165|$72.31
173. SV05: Temporal ForcesIllustration Rare, #177/162Gastly - 177/162|$111.33
174. SM PromosPromo, #SM210Moltres & Zapdos & Articuno GX|$168.16
175. ME01: Mega EvolutionIllustration Rare, #146/132Marshadow - 146/132|$20.63
176. ME: Ascended HeroesIllustration Rare, #218/217Erika's Tangela - 218/217|$27.07
177. ME03: Perfect OrderUltra Rare, #107/088Meowth ex - 107/088|$16.43
178. Miscellaneous Cards & ProductsCommon, #051/162Pikachu (Pokemon Day 2026)|$5.64
179. FossilCommon, #50/62Kabuto|$19.06
180. SWSH: Sword & Shield Promo CardsPromo, #SWSH261Charizard VMAX - SWSH261|$43.75
181. SV09: Journey TogetherIllustration Rare, #162/159Wailord - 162/159|$18.74
182. ME04: Chaos RisingDouble Rare, #022/086Mega Greninja ex - 022/086|$2.46
183. SV10: Destined RivalsIllustration Rare, #194/182Misty's Lapras - 194/182|$42.14
184. SV: Scarlet & Violet Promo CardsPromo, #208Victini - 208|$15.94
185. Neo DestinySecret Rare, #113/105Shining Tyranitar|$4,249.99
186. SV: White FlareBlack White Rare, #173/086Reshiram ex - 173/086|$467.92
187. SV: Prismatic EvolutionsSpecial Illustration Rare, #144/131Leafeon ex - 144/131|$331.35
188. ME04: Chaos RisingSpecial Illustration Rare, #121/086Roxie's Performance - 121/086|$35.77
189. SV: Scarlet & Violet Promo CardsPromo, #027Pikachu - 027|$25.08
190. SV: Scarlet & Violet 151Illustration Rare, #181/165Dragonair - 181/165|$53.35
191. XY - Ancient OriginsUltra Rare, #98/98M Rayquaza EX (Shiny Full Art)|$957.50
192. SV08: Surging SparksSpecial Illustration Rare, #237/191Milotic ex - 237/191|$143.00
193. ME: Ascended HeroesSpecial Illustration Rare, #289/217Steven's Metagross ex|$106.23
194. JungleHolo Rare, #08/64Pidgeot (8)|$132.47
195. SM - Team UpUltra Rare, #165/181Gengar & Mimikyu GX (Alternate Full Art)|$1,522.01
196. SV05: Temporal ForcesACE SPEC Rare, #162/162Neo Upper Energy|$20.94
197. SV03: Obsidian FlamesIllustration Rare, #199/197Ninetales -199/197|$50.80
198. JungleHolo Rare, #07/64Nidoqueen (7)|$110.94
199. WoTC PromoPromo, #34/53Entei|$33.39
200. ME04: Chaos RisingIllustration Rare, #096/086Tauros - 096/086|$6.02
201. Neo DestinySecret Rare, #109/105Shining Mewtwo|$3,000.00
202. FossilHolo Rare, #13/62Muk (13)|$51.26
203. SV: Scarlet & Violet Promo CardsPromo, #131Kingdra ex - 131|$98.26
204. FossilHolo Rare, #06/62Haunter (6)|$112.89
205. SV: Scarlet & Violet Promo CardsPromo, #159Magneton - 159|$9.58
206. Gym HeroesHolo Rare, #013/132Rocket's Scyther|$349.99
207. SV: Scarlet & Violet 151Illustration Rare, #167/165Ivysaur - 167/165|$54.97
208. ME: Ascended HeroesSpecial Illustration Rare, #272/217Mega Meganium ex - 272/217|$102.05
209. SV: Scarlet & Violet Promo CardsPromo, #085Pikachu with Grey Felt Hat|$985.24
210. ME03: Perfect OrderIllustration Rare, #095/088Espurr - 095/088|$6.97
211. ME03: Perfect OrderIllustration Rare, #090/088Rowlet - 090/088|$6.95
212. SWSH: Crown Zenith: Galarian GallerySecret Rare, #GG67/GG70Origin Forme Palkia VSTAR (Secret)|$134.51
213. Generations: Radiant CollectionUltra Rare, #RC28/RC32Flareon EX (Full Art)|$176.95
214. SV: Scarlet & Violet Promo CardsPromo, #075Mimikyu - 075|$16.03
215. SV09: Journey TogetherIllustration Rare, #167/159N's Reshiram - 167/159|$19.37
216. SWSH07: Evolving SkiesUltra Rare, #192/203Dragonite V (Alternate Full Art)|$503.31
217. SV10: Destined RivalsSpecial Illustration Rare, #229/182Team Rocket's Moltres ex - 229/182|$127.21
218. Gym ChallengeHolo Rare, #013/132Misty's Gyarados|$360.24
219. JungleRare, #27/64Snorlax (27)|$62.63
220. Gym ChallengeHolo Rare, #005/132Giovanni's Gyarados|$360.00
221. SV: Scarlet & Violet 151Special Illustration Rare, #201/165Alakazam ex - 201/165|$82.77
222. ME01: Mega EvolutionIllustration Rare, #133/132Bulbasaur - 133/132|$24.18
223. Legendary Treasures: Radiant CollectionUltra Rare, #RC24/RC25Mew EX (Full Art)|$179.11
224. SV: Black BoltIllustration Rare, #105/086Seismitoad - 105/086|$223.83
225. Base SetHolo Rare, #012/102Ninetales|$39.13
226. SV09: Journey TogetherIllustration Rare, #162/159Wailord - 162/159|$18.74
227. SV08: Surging SparksIllustration Rare, #203/191Latios - 203/191|$39.82
228. ME: Mega Evolution PromoIllustration Rare, #027Haunter  - 027|$59.67
229. Gym ChallengeHolo Rare, #016/132Sabrina's Alakazam|$246.16
230. Neo GenesisHolo Rare, #018/111Typhlosion (18)|$435.00
231. SV10: Destined RivalsSpecial Illustration Rare, #233/182Team Rocket's Nidoking ex - 233/182|$124.26
232. SV: Scarlet & Violet Promo CardsPromo, #174Eevee ex - 174|$29.87
233. SV06: Twilight MasqueradeIllustration Rare, #188/167Eevee - 188/167|$92.17
234. SM PromosPromo, #SM201Reshiram & Charizard GX - SM201|$166.31
235. Base SetHolo Rare, #001/102Alakazam|$82.65
236. FossilHolo Rare, #03/62Ditto (3)|$109.52
237. JungleHolo Rare, #01/64Clefable (1)|$109.48
238. SWSH: Sword & Shield Promo CardsPromoPikachu V-Union [Set of 4]|$46.85
239. JungleHolo Rare, #06/64Mr. Mime (6)|$97.87
240. SV03: Obsidian FlamesHyper Rare, #228/197Charizard ex - 228/197|$46.55
241. SV03: Obsidian FlamesIllustration Rare, #202/197Cleffa - 202/197|$43.74
242. SV: Black BoltBlack White Rare, #172/086Zekrom ex - 172/086|$520.59
243. ME: Mega Evolution PromoPromo, #041Chimchar - 041|$7.62
244. JungleHolo Rare, #15/64Vileplume (15)|$91.07
245. Neo DiscoveryHolo Rare, #01/75Espeon (1)|$388.98
246. Miscellaneous Cards & ProductsDouble Rare, #229/182Team Rocket's Moltres ex - 229/182 (Destined Rivals Stamp)|$78.04
247. CelebrationsHolo Rare, #011/025Mew|$4.17
248. SWSH: Crown Zenith: Galarian GallerySecret Rare, #GG68/GG70Origin Forme Dialga VSTAR (Secret)|$138.86
249. Gym ChallengeHolo Rare, #002/132Blaine's Charizard|$894.61
250. SV: Prismatic EvolutionsSpecial Illustration Rare, #150/131Glaceon ex - 150/131|$297.83
251. Neo DestinyHolo Rare, #009/105Dark Scizor|$595.34
252. ME01: Mega EvolutionMega Hyper Rare, #188/132Mega Lucario ex - 188/132|$260.95
253. ME: Mega Evolution PromoPromo, #040Turtwig - 040|$7.87
254. XY PromosPromo, #XY122Blastoise EX - XY122|$251.59
255. Legendary Treasures: Radiant CollectionUltra Rare, #RC22/RC25Reshiram (Full Art)|$157.51
256. Dragon FrontiersUltra Rare, #101/101Mew Star (Delta Species)|$3,500.00
257. SV: Black BoltSpecial Illustration Rare, #166/086Zekrom ex - 166/086|$261.15
258. ME02: Phantasmal FlamesDouble Rare, #056/094Mega Gengar ex|$2.72
259. SV06: Twilight MasqueradeDouble Rare, #106/167Greninja ex - 106/167|$7.70
260. ME03: Perfect OrderIllustration Rare, #093/088Dedenne - 093/088|$5.95
261. ME: Mega Evolution PromoPromo, #044Litten - 044|$7.72
262. SV09: Journey TogetherSpecial Illustration Rare, #187/159Salamence ex - 187/159|$71.12
263. Generations: Radiant CollectionUltra Rare, #RC29/RC32Pikachu (Full Art)|$133.52
264. ME04: Chaos RisingUltra Rare, #113/086Special Red Card - 113/086|$8.30
265. SV10: Destined RivalsIllustration Rare, #190/182Ethan's Typhlosion - 190/182|$34.56
266. SV01: Scarlet & Violet Base SetSpecial Illustration Rare, #245/198Gardevoir ex - 245/198|$87.70
267. SM PromosPromo, #SM228Armored Mewtwo - SM228|$242.10
268. SWSH07: Evolving SkiesSecret Rare, #205/203Leafeon VMAX (Alternate Art Secret)|$391.03
269. Base SetHolo Rare, #003/102Chansey|$56.60
270. ME: Mega Evolution PromoPromo, #043Rowlet - 043|$6.87
271. FossilHolo Rare, #01/62Aerodactyl (1)|$75.85
272. SV10: Destined RivalsIllustration Rare, #203/182Team Rocket's Meowth - 203/182|$32.06
273. SV09: Journey TogetherCommon, #120/159Dunsparce|$2.36
274. SWSH08: Fusion StrikeUltra Rare, #114/264Mew VMAX|$19.33
275. ME: Ascended HeroesSpecial Illustration Rare, #287/217Marnie's Grimmsnarl ex|$85.67
276. SWSH: Crown ZenithRadiant Rare, #020/159Radiant Charizard|$13.86
277. SV: Paldean FatesSpecial Illustration Rare, #234/091Charizard ex - 234/091|$332.93
278. ME02: Phantasmal FlamesSpecial Illustration Rare, #129/094Dawn - 129/094|$30.43
279. ME: Mega Evolution PromoPromo, #080Fennekin - 080 (Pokemon Center Exclusive)|$61.01
280. ME04: Chaos RisingUltra Rare, #114/086Surfing Beach|$9.26
281. Team RocketSecret Rare, #83/82Dark Raichu|$238.86
282. SV: Paldean FatesSpecial Illustration Rare, #233/091Gardevoir ex - 233/091|$184.20
283. SV: Black BoltBlack White Rare, #171/086Victini - 171/086|$573.14
284. SV: Scarlet & Violet Promo CardsPromo, #088Pikachu - 088|$27.98
285. SM - Team UpUltra Rare, #53/181Gengar & Mimikyu GX|$314.08
286. ME02: Phantasmal FlamesIllustration Rare, #105/094Wigglytuff - 105/094|$7.44
287. SWSH07: Evolving SkiesUltra Rare, #189/203Umbreon V (Alternate Full Art)|$373.71
288. SV: White FlareSpecial Illustration Rare, #166/086Reshiram ex - 166/086|$211.12
289. ME04: Chaos RisingIllustration Rare, #095/086Sliggoo - 095/086|$4.87
290. Generations: Radiant CollectionUltra Rare, #RC31/RC32M Gardevoir EX (Full Art)|$109.04
291. Base Set (Shadowless)Uncommon, #024/102Charmeleon|$127.77
292. WoTC PromoPromo, #05/53Dragonite (Movie Promo)|$69.81
293. JungleHolo Rare, #14/64Victreebel (14)|$104.48
294. SWSH: Sword & Shield Promo CardsPromo, #SWSH284Galarian Moltres - SWSH284|$18.34
295. SM PromosPromo, #SM240Espeon & Deoxys GX - SM240|$126.54
296. SV: Scarlet & Violet 151Ultra Rare, #193/165Mew ex - 193/165|$46.63
297. ME01: Mega EvolutionSpecial Illustration Rare, #184/132Lillie's Determination - 184/132|$73.77
298. ME: Ascended HeroesIllustration Rare, #239/217Team Rocket's Dugtrio - 239/217|$15.51
299. ME: Ascended HeroesDouble Rare, #022/217Mega Charizard Y ex - 022/217|$8.87
300. SWSH: Sword & Shield Promo CardsPromo, #SWSH029Rayquaza - SWSH029|$8.88
301. XY - Phantom ForcesUltra Rare, #34/119Gengar EX|$74.50
302. ME04: Chaos RisingUltra Rare, #098/086Beedrill ex - 098/086|$7.70
303. JungleCommon, #50/64Cubone|$12.38
304. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG35/GG70Leafeon VSTAR|$88.67
305. UndauntedUltra Rare, #86/90Umbreon (Prime)|$506.94
306. Base Set (Shadowless)Uncommon, #035/102Magikarp|$181.72
307. ME01: Mega EvolutionMega Hyper Rare, #187/132Mega Gardevoir ex - 187/132|$232.90
308. Celebrations: Classic CollectionClassic Collection, #76/108M Rayquaza EX|$54.29
309. ME01: Mega EvolutionIllustration Rare, #134/132Ivysaur - 134/132|$22.72
310. Neo RevelationHolo Rare, #13/64Raikou (13)|$499.50
311. SWSH12: Silver Tempest Trainer GalleryUltra Rare, #TG20/TG30Rayquaza VMAX|$208.89
312. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG38/GG70Suicune V|$70.55
313. ME: Mega Evolution PromoPromo, #045Popplio - 045|$6.20
314. SV: Scarlet & Violet Promo CardsPromo, #SVP 176Umbreon ex - 176|$44.60
315. JungleHolo Rare, #13/64Venomoth (13)|$88.23
316. Base Set (Shadowless)Common, #063/102Squirtle|$134.47
317. FossilHolo Rare, #07/62Hitmonlee (7)|$78.21
318. ME: Mega Evolution PromoPromo, #029Mega Charizard X ex - 029|$6.43
319. Team RocketRare, #20/82Dark Blastoise (20)|$67.19
320. ME04: Chaos RisingIllustration Rare, #093/086Crobat - 093/086|$5.29
321. ME: Ascended HeroesIllustration Rare, #232/217Marill - 232/217|$17.31
322. SV: Prismatic EvolutionsSpecial Illustration Rare, #146/131Flareon ex - 146/131|$203.96
323. XY - Fates CollideSecret Rare, #125/124Alakazam EX (Secret)|$134.86
324. SWSH11: Lost OriginUltra Rare, #186/196Giratina V (Alternate Full Art)|$796.30
325. SM PromosPromo, #SM162Pikachu - SM162|$158.72
326. WoTC PromoPromo, #09/53Mew (9)|$114.86
327. SM - Cosmic EclipseSecret Rare, #241/236Pikachu (Secret)|$234.93
328. FossilCommon, #53/62Psyduck|$10.83
329. ME: Mega Evolution PromoPromo, #009Alakazam - 009|$12.67
330. SV03: Obsidian FlamesSpecial Illustration Rare, #225/197Pidgeot ex - 225/197|$24.20
331. SM - Unbroken BondsUltra Rare, #20/214Reshiram & Charizard GX|$56.56
332. JungleHolo Rare, #09/64Pinsir (9)|$84.70
333. SV: Prismatic EvolutionsSpecial Illustration Rare, #155/131Espeon ex - 155/131|$331.18
334. SV05: Temporal ForcesACE SPEC Rare, #152/162Hero's Cape|$23.72
335. SWSH08: Fusion StrikeSecret Rare, #269/264Mew VMAX (Alternate Art Secret)|$250.87
336. SV08: Surging SparksUltra Rare, #219/191Pikachu ex - 219/191|$34.89
337. Team RocketHolo Rare, #01/82Dark Alakazam (1)|$146.65
338. ME: Ascended HeroesMega Attack Rare, #265/217Mega Froslass ex - 265/217|$14.90
339. ME01: Mega EvolutionSpecial Illustration Rare, #181/132Mega Latias ex - 181/132|$93.13
340. Miscellaneous Cards & ProductsPromo, #060/131Umbreon ex - 060/131 (Prismatic Evolutions Stamp)|$24.20
341. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG22/GG70Ditto|$21.39
342. SV01: Scarlet & Violet Base SetIllustration Rare, #210/198Drowzee - 210/198|$69.04
343. SV: Scarlet & Violet Promo CardsPromo, #074Charizard ex - 074|$26.86
344. ME02: Phantasmal FlamesSpecial Illustration Rare, #127/094Mega Sharpedo ex - 127/094|$24.49
345. Alternate Art PromosPromo, #177a/168Rayquaza GX - 177a/168|$173.93
346. ME03: Perfect OrderUltra Rare, #102/088Mega Starmie ex - 102/088|$10.84
347. SWSH11: Lost Origin Trainer GalleryUltra Rare, #TG03/TG30Charizard|$33.92
348. ME01: Mega EvolutionIllustration Rare, #138/132Vulpix - 138/132|$18.67
349. Gym HeroesHolo Rare, #012/132Rocket's Moltres|$230.63
350. SV10: Destined RivalsSpecial Illustration Rare, #234/182Team Rocket's Crobat ex - 234/182|$75.86
351. SWSH08: Fusion StrikeUltra Rare, #157/264Gengar VMAX|$48.90
352. SV: Scarlet & Violet 151Double Rare, #205/165Mew ex - 205/165 (151 Metal Card)|$31.74
353. Team RocketHolo Rare, #02/82Dark Arbok (2)|$49.95
354. SV: Prismatic EvolutionsHyper Rare, #179/131Pikachu ex - 179/131|$71.99
355. Miscellaneous Cards & ProductsRare, #094/165Gengar 094/165 (Cosmos Holo)|$26.01
356. Base SetHolo Rare, #016/102Zapdos|$54.88
357. SM PromosPromo, #SM233Eevee GX - SM233|$148.49
358. SWSH07: Evolving SkiesUltra Rare, #180/203Espeon V (Alternate Full Art)|$233.31
359. ME: Ascended HeroesUltra Rare, #256/217Boss's Orders [Corbeau] - 256/217|$9.11
360. Base Set (Shadowless)Holo Rare, #007/102Hitmonchan|$254.99
361. SV09: Journey TogetherSpecial Illustration Rare, #185/159N's Zoroark ex - 185/159|$55.47
362. SWSH04: Vivid VoltageAmazing Rare, #138/185Rayquaza|$28.44
363. XY - Roaring SkiesUltra Rare, #105/108M Rayquaza EX (105 Full Art)|$369.45
364. ME: Ascended HeroesIllustration Rare, #221/217Budew - 221/217|$10.87
365. SV: Prismatic EvolutionsSpecial Illustration Rare, #165/131Dragapult ex - 165/131|$142.41
366. ME: Ascended HeroesSpecial Illustration Rare, #283/217Mega Hawlucha ex - 283/217|$76.23
367. ME: Mega Evolution PromoPromo, #030Mega Charizard Y ex - 030|$6.50
368. ME04: Chaos RisingIllustration Rare, #094/086Metang - 094/086|$4.72
369. SV: Scarlet & Violet 151Hyper Rare, #205/165Mew ex - 205/165|$33.57
370. SV: White FlareIllustration Rare, #105/086Oshawott - 105/086|$91.54
371. Alternate Art PromosPromo, #143a/236Togepi & Cleffa & Igglybuff GX - 143a/236|$243.69
372. SWSH09: Brilliant Stars Trainer GalleryUltra Rare, #TG02/TG30Vaporeon|$30.41
373. Base SetHolo Rare, #007/102Hitmonchan|$25.46
374. ME: Ascended HeroesIllustration Rare, #234/217Banette - 234/217|$12.61
375. Neo DestinySecret Rare, #107/105Shining Charizard|$3,998.99
376. SV: Prismatic EvolutionsSpecial Illustration Rare, #162/131Roaring Moon ex|$181.49
377. ME: Mega Evolution PromoPromo, #075Ampharos - 075 [Staff]|$59.90
378. SV: Prismatic EvolutionsSpecial Illustration Rare, #149/131Vaporeon ex - 149/131|$293.31
379. TriumphantUltra Rare, #94/102Gengar (Prime)|$463.88
380. JungleCommon, #54/64Jigglypuff|$9.95
381. XY - FlashfireSecret Rare, #108/106M Charizard EX (X) (Secret)|$874.58
382. SM PromosPromo, #SM169Eevee & Snorlax GX - SM169|$167.31
383. ME: Ascended HeroesUltra Rare, #264/217Ultra Ball - 264/217|$8.32
384. ME: Mega Evolution PromoPromo, #080Fennekin - 080|$5.39
385. Base SetHolo Rare, #014/102Raichu|$71.09
386. ME: Ascended HeroesIllustration Rare, #244/217Cynthia's Spiritomb - 244/217|$14.55
387. ME01: Mega EvolutionSpecial Illustration Rare, #180/132Mega Absol ex - 180/132|$73.63
388. Dragons ExaltedUltra Rare, #85/124Rayquaza EX|$31.57
389. SWSH11: Lost OriginUltra Rare, #180/196Aerodactyl V (Alternate Full Art)|$226.12
390. SM - Team UpUltra Rare, #161/181Magikarp & Wailord GX (Alternate Full Art)|$851.09
391. SV: Scarlet & Violet 151Double Rare, #151/165Mew ex - 151/165|$9.55
392. ME02: Phantasmal FlamesIllustration Rare, #097/094Dewgong - 097/094|$5.48
393. Team RocketRare, #22/82Dark Dragonite (22)|$64.11
394. SV03: Obsidian FlamesIllustration Rare, #198/197Gloom - 198/197|$27.60
395. Generations: Radiant CollectionUncommon, #RC5/RC32Charizard|$57.16
396. Neo GenesisHolo Rare, #014/111Slowking|$202.94
397. Team RocketUncommon, #45/82Dark Vaporeon|$22.96
398. XY - FlashfireUltra Rare, #69/106M Charizard EX (X)|$278.04
399. SV02: Paldea EvolvedIllustration Rare, #226/193Maushold - 226/193|$107.21
400. WoTC PromoPromo, #11/53Eevee|$50.15
401. ME04: Chaos RisingIllustration Rare, #092/086Claydol - 092/086|$3.69
402. Shining Fates: Shiny VaultShiny Holo Rare, #SV107/SV122Charizard VMAX|$148.43
403. ME02: Phantasmal FlamesSpecial Illustration Rare, #128/094Mega Lopunny ex - 128/094|$20.82
404. SV06: Twilight MasqueradeACE SPEC Rare, #163/167Secret Box|$9.80
405. SV06: Twilight MasqueradeSpecial Illustration Rare, #220/167Perrin - 220/167|$183.65
406. ME: Mega Evolution PromoPromo, #070Tyrunt - 070|$3.54
407. SWSH09: Brilliant Stars Trainer GalleryUltra Rare, #TG23/TG30Umbreon VMAX|$110.76
408. Gym ChallengeHolo Rare, #009/132Koga's Beedrill|$130.29
409. Gym ChallengeHolo Rare, #009/132Koga's Beedrill|$130.29
410. SWSH07: Evolving SkiesSecret Rare, #212/203Sylveon VMAX (Alternate Art Secret)|$383.79
411. ME: Ascended HeroesIllustration Rare, #247/217Dreepy - 247/217|$11.75
412. SV08: Surging SparksIllustration Rare, #197/191Ceruledge - 197/191|$24.14
413. FossilUncommon, #58/62Mr. Fuji|$14.17
414. ME: Ascended HeroesSpecial Illustration Rare, #285/217Mega Scrafty ex - 285/217|$76.02
415. Miscellaneous Cards & ProductsIllustration Rare, #167/159N's Reshiram - 167/159 (Journey Together Stamped)|$22.10
416. ME: Ascended HeroesSpecial Illustration Rare, #279/217Iono's Bellibolt ex - 279/217|$76.63
417. SV: Prismatic EvolutionsSpecial Illustration Rare, #167/131Eevee ex - 167/131|$188.91
418. XY PromosPromo, #XY133Ash-Greninja EX - XY133|$84.39
419. SV06: Twilight MasqueradeIllustration Rare, #187/167Chansey - 187/167|$58.14
420. JungleHolo Rare, #16/64Wigglytuff (16)|$77.45
421. XY PromosPromo, #XY110Mew - XY110|$131.95
422. ME: Ascended HeroesSpecial Illustration Rare, #288/217Fezandipiti ex - 288/217|$74.89
423. Celebrations: Classic CollectionClassic Collection, #88/92Mew ex|$24.78
424. Gym HeroesUncommon, #058/132Sabrina's Haunter|$52.55
425. SV: Scarlet & Violet 151Ultra Rare, #183/165Charizard ex - 183/165|$45.66
426. Crystal GuardiansHolo Rare, #4/100Charizard (Delta Species)|$539.00
427. SWSH07: Evolving SkiesSecret Rare, #209/203Glaceon VMAX (Alternate Art Secret)|$291.59
428. ME: Ascended HeroesDouble Rare, #047/217Mega Froslass ex - 047/217|$5.47
429. JungleRare, #20/64Jolteon (20)|$51.41
430. SV: Scarlet & Violet 151Illustration Rare, #172/165Caterpie - 172/165|$20.37
431. SV04: Paradox RiftSpecial Illustration Rare, #253/182Altaria ex - 253/182|$60.64
432. ME03: Perfect OrderUltra Rare, #104/088Mega Zygarde ex - 104/088|$9.64
433. ME01: Mega EvolutionUltra Rare, #155/132Mega Venusaur ex - 155/132|$14.19
434. SV04: Paradox RiftIllustration Rare, #199/182Groudon - 199/182|$117.44
435. ME: Mega Evolution PromoPromo, #031N's Zekrom - 031 (Pokemon Center Exclusive)|$104.65
436. Base Set (Shadowless)Holo Rare, #010/102Mewtwo|$358.01
437. SV10: Destined RivalsUltra Rare, #213/182Team Rocket's Mewtwo ex - 213/182|$23.44
438. Miscellaneous Cards & ProductsRare, #050/088Gengar (Cosmos Holo) (Gamestop Exclusive)|$147.74
439. ME03: Perfect OrderIllustration Rare, #092/088Aurorus - 092/088|$4.34
440. SV10: Destined RivalsIllustration Rare, #184/182Cynthia's Roserade - 184/182|$17.52
441. Gym HeroesHolo Rare, #010/132Misty's Tentacruel|$89.16
442. FossilHolo Rare, #08/62Hypno (8)|$63.82
443. ExpeditionHolo Rare, #013/165Gengar (13)|$675.49
444. Gym ChallengeRare, #029/132Sabrina's Gengar|$187.00
445. Neo DiscoveryHolo Rare, #12/75Tyranitar (12)|$420.24
446. Gym HeroesRare, #033/132Rocket's Snorlax|$145.99
447. POP Series 1Ultra Rare, #017/017Tyranitar ex (Holo)|$335.66
448. SV: Scarlet & Violet Promo CardsPromo, #056Charizard ex - 056|$16.95
449. SV: White FlareBlack White Rare, #172/086Victini - 172/086|$477.35
450. Jumbo CardsPromoPikachu V-UNION|$16.92
451. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG05/GG70Lapras|$27.15
452. Neo RevelationHolo Rare, #03/64Celebi (3)|$349.99
453. ME: Ascended HeroesDouble Rare, #142/217Fezandipiti ex - 142/217|$3.83
454. Base Set (Shadowless)Common, #058/102Pikachu|$169.43
455. SV: Prismatic EvolutionsSpecial Illustration Rare, #157/131Iron Valiant ex|$75.04
456. Base Set (Shadowless)Holo Rare, #016/102Zapdos|$600.00
457. SM PromosPromo, #SM166Magikarp & Wailord GX|$126.77
458. ME: Ascended HeroesSpecial Illustration Rare, #273/217Mega Emboar ex - 273/217|$74.89
459. Team RocketCommon, #68/82Squirtle|$13.62
460. ME01: Mega EvolutionSpecial Illustration Rare, #182/132Mega Kangaskhan ex - 182/132|$68.17
461. XY PromosPromo, #XY123Venusaur EX - XY123|$211.06
462. ME02: Phantasmal FlamesSpecial Illustration Rare, #126/094Rotom ex - 126/094|$18.85
463. ME04: Chaos RisingDouble Rare, #003/086Beedrill ex - 003/086|$1.46
464. SV: Prismatic EvolutionsSpecial Illustration Rare, #153/131Jolteon ex - 153/131|$197.76
465. ME: Ascended HeroesSpecial Illustration Rare, #291/217Canari - 291/217|$49.43
466. ME: Ascended HeroesDouble Rare, #152/217Mega Dragonite ex - 152/217|$4.94
467. Neo RevelationHolo Rare, #06/64Entei (6)|$325.00
468. Pokemon GOUltra Rare, #072/078Mewtwo V (Alternate Full Art)|$66.95
469. Neo DestinyHolo Rare, #012/105Light Arcanine|$460.00
470. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG41/GG70Raikou V|$54.08
471. Gym ChallengeHolo Rare, #008/132Giovanni's Persian|$194.99
472. ME: Mega Evolution PromoPromo, #076Crobat - 076 [Staff]|$52.74
473. Gym HeroesCommon, #081/132Lt. Surge's Pikachu|$23.59
474. SWSH11: Lost Origin Trainer GalleryUltra Rare, #TG16/TG30Pikachu V|$125.60
475. ExpeditionHolo Rare, #009/165Dragonite (9)|$799.69
476. ME03: Perfect OrderUltra Rare, #109/088Forest of Vitality|$7.11
477. SWSH08: Fusion StrikeUltra Rare, #251/264Mew V (Alternate Full Art)|$114.13
478. SV04: Paradox RiftSpecial Illustration Rare, #251/182Roaring Moon ex - 251/182|$42.47
479. SV02: Paldea EvolvedIllustration Rare, #196/193Sprigatito - 196/193|$57.80
480. SWSH09: Brilliant Stars Trainer GalleryUltra Rare, #TG16/TG30Mimikyu V|$90.82
481. SWSH09: Brilliant Stars Trainer GalleryUltra Rare, #TG01/TG30Flareon|$22.80
482. SV01: Scarlet & Violet Base SetIllustration Rare, #211/198Ralts - 211/198|$53.84
483. SWSH08: Fusion StrikeUltra Rare, #113/264Mew V|$9.36
484. SWSH08: Fusion StrikeUltra Rare, #245/264Celebi V (Alternate Full Art)|$100.76
485. SWSH: Sword & Shield Promo CardsPromo, #SWSH182Vaporeon VMAX - SWSH182|$92.91
486. CelebrationsSecret Rare, #025/025Mew (Secret)|$73.64
487. ME: Ascended HeroesIllustration Rare, #225/217Scorbunny - 225/217|$11.60
488. SV: Prismatic EvolutionsDouble Rare, #060/131Umbreon ex - 060/131|$7.43
489. Shining LegendsShiny Holo Rare, #56/73Shining Rayquaza|$117.84
490. CelebrationsUltra Rare, #008/025Surfing Pikachu V|$5.37
491. Pokemon GORadiant Rare, #011/078Radiant Charizard|$25.05
492. ME03: Perfect OrderUncommon, #081/088Poke Pad - 081/088|$0.37
493. SV01: Scarlet & Violet Base SetIllustration Rare, #204/198Slowpoke - 204/198|$46.36
494. Neo DiscoveryRare, #20/75Espeon (20)|$85.36
495. Gym HeroesHolo Rare, #008/132Lt. Surge's Magneton|$80.55
496. SWSH: Crown Zenith: Galarian GalleryUltra Rare, #GG56/GG70Hisuian Zoroark VSTAR|$50.04
497. ME02: Phantasmal FlamesUltra Rare, #118/094Dawn - 118/094|$6.74
498. SWSH11: Lost Origin Trainer GalleryUltra Rare, #TG10/TG30Snorlax|$21.78
499. ME02: Phantasmal FlamesIllustration Rare, #100/094Zacian - 100/094|$4.52
500. Gym HeroesHolo Rare, #018/132Misty (18)|$169.36`;

// Parse: each line is "N. SetRarity, #NumberCardName|$Price"
const cards = [];
for (const line of raw.split("\n")) {
  const priceMatch = line.match(/\$([0-9,]+\.\d+)$/);
  if (!priceMatch) continue;
  const price = parseFloat(priceMatch[1].replace(/,/g, ""));

  // Extract rank
  const rankMatch = line.match(/^(\d+)\.\s*/);
  const rank = rankMatch ? parseInt(rankMatch[1]) : cards.length + 1;

  // Extract card number
  const numMatch = line.match(/#([^\s]+?)([A-Z])/);
  const number = numMatch ? numMatch[1] : "";

  // Extract card name (between the number and the | delimiter)
  const nameMatch = line.match(/#[^\s]+?([A-Z].*?)\|/);
  const cardName = nameMatch ? nameMatch[1].trim() : "";

  // Extract set name (between rank and rarity)
  const setMatch = line.match(/^\d+\.\s*(.+?)(?:Special Illustration Rare|Illustration Rare|Mega Hyper Rare|Mega Attack Rare|Black White Rare|Ultra Rare|Holo Rare|Double Rare|Hyper Rare|Secret Rare|Radiant Rare|Amazing Rare|Shiny Holo Rare|ACE SPEC Rare|Classic Collection|Common|Uncommon|Rare|Promo)/);
  const setName = setMatch ? setMatch[1].trim() : "";

  cards.push({ rank, setName, number, cardName, price });
}

// Calculate total
const total = cards.reduce((sum, c) => sum + c.price, 0);
console.log(`Parsed ${cards.length} cards`);
console.log(`PL500 Index Value: $${total.toFixed(2)}`);
console.log(`Average card price: $${(total / cards.length).toFixed(2)}`);
console.log(`\nTop 10 most expensive:`);
const sorted = [...cards].sort((a, b) => b.price - a.price);
for (let i = 0; i < 10; i++) {
  console.log(`  ${sorted[i].cardName} — $${sorted[i].price.toFixed(2)}`);
}
console.log(`\nBottom 5 cheapest:`);
for (let i = sorted.length - 5; i < sorted.length; i++) {
  console.log(`  ${sorted[i].cardName} — $${sorted[i].price.toFixed(2)}`);
}

// Test TCGPlayer search API to find product IDs
async function testSearch(query) {
  const url = `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(query)}&isList=false&mpfev=2952`;
  const body = {
    algorithm: "",
    from: 0,
    size: 3,
    filters: {
      term: { productLineName: ["pokemon"] },
      range: {},
      match: {},
    },
    listingSearch: {
      filters: { term: {}, range: {}, exclude: { channelExclusion: 0 } },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
    settings: { useFuzzySearch: true, didYouMean: {} },
    sort: {},
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const results = data?.results?.[0]?.results || [];
  return results.map(r => ({
    productId: r.productId,
    productName: r.productName,
    setName: r.setName,
    number: r.customAttributes?.number,
    marketPrice: r.marketPrice,
  }));
}

// Test with a few known cards
async function main() {
  console.log("\n--- Testing TCGPlayer Search API ---");

  const tests = [
    "Charizard 199/165 Scarlet Violet 151",
    "Umbreon VMAX 215/203 Evolving Skies",
    "Pikachu 276/217 Ascended Heroes",
  ];

  for (const q of tests) {
    console.log(`\nSearch: "${q}"`);
    const results = await testSearch(q);
    for (const r of results.slice(0, 2)) {
      console.log(`  ID: ${r.productId} | ${r.productName} | ${r.setName} | #${r.number} | $${r.marketPrice}`);
    }
  }
}

main().catch(console.error);
