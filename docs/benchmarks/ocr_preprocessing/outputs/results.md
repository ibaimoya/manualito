# Resultados OCR/preprocesado

## Tesseract

| Técnica | Familia | Parámetros | CER | dCER | WER | Fragmentos | Pre | OCR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Resize x2.5 + grises | reescalado | factor=2.5, INTER_CUBIC | 0.0771 | -0.1418 | 0.1841 | 47/58 | 0.024s | 9.120s |
| Resize x1.5 + grises | reescalado | factor=1.5, INTER_CUBIC | 0.0912 | -0.1278 | 0.2279 | 44/58 | 0.010s | 5.263s |
| Resize x2 + grises | reescalado | factor=2, INTER_CUBIC | 0.0980 | -0.1209 | 0.2279 | 45/58 | 0.020s | 6.955s |
| Resize x3 + grises | reescalado | factor=3, INTER_CUBIC | 0.1072 | -0.1118 | 0.2584 | 41/58 | 0.043s | 11.665s |
| Resize x2 + CLAHE | pipeline | factor=2, CLAHE c=2 t=8 | 0.1165 | -0.1025 | 0.2479 | 45/58 | 0.032s | 6.485s |
| Resize x2 + Otsu | pipeline | factor=2, Otsu | 0.1171 | -0.1019 | 0.2570 | 42/58 | 0.029s | 5.191s |
| CLAHE c=1 t=4 | contraste | clip=1, tile=4x4 | 0.1180 | -0.1009 | 0.2968 | 39/58 | 0.005s | 3.488s |
| Escala de grises | color | BGR2GRAY | 0.1212 | -0.0977 | 0.2957 | 39/58 | 0.002s | 3.588s |
| CLAHE c=1 t=16 | contraste | clip=1, tile=16x16 | 0.1258 | -0.0931 | 0.3051 | 39/58 | 0.005s | 3.553s |
| Resize x2 + CLAHE + Otsu | pipeline | factor=2, CLAHE c=2 t=8, Otsu | 0.1277 | -0.0912 | 0.2626 | 44/58 | 0.050s | 4.962s |
| CLAHE c=1 t=8 | contraste | clip=1, tile=8x8 | 0.1294 | -0.0896 | 0.2946 | 39/58 | 0.005s | 3.564s |
| Bilateral d=5 s=50 | ruido | d=5, sigma=50 | 0.1400 | -0.0790 | 0.3063 | 37/58 | 0.008s | 3.781s |
| Otsu | binarización | THRESH_OTSU | 0.1474 | -0.0715 | 0.3450 | 35/58 | 0.004s | 3.118s |
| Bilateral d=9 s=50 | ruido | d=9, sigma=50 | 0.1543 | -0.0646 | 0.3273 | 37/58 | 0.064s | 3.809s |
| Nitidez s=3 a=1.5 | nitidez | sigma=3, amount=1.5 | 0.1603 | -0.0587 | 0.3696 | 34/58 | 0.008s | 3.690s |
| Nitidez s=1 a=1 | nitidez | sigma=1, amount=1 | 0.1648 | -0.0541 | 0.3446 | 37/58 | 0.006s | 3.713s |
| Nitidez s=3 a=2 | nitidez | sigma=3, amount=2 | 0.1669 | -0.0520 | 0.3823 | 31/58 | 0.008s | 3.758s |
| Bilateral d=5 s=75 | ruido | d=5, sigma=75 | 0.1696 | -0.0493 | 0.3290 | 40/58 | 0.008s | 3.721s |
| CLAHE c=2 t=4 | contraste | clip=2, tile=4x4 | 0.1701 | -0.0489 | 0.3438 | 35/58 | 0.005s | 2.597s |
| Bilateral d=9 s=75 | ruido | d=9, sigma=75 | 0.1713 | -0.0476 | 0.3374 | 36/58 | 0.060s | 3.946s |
| Nitidez s=3 a=1 | nitidez | sigma=3, amount=1 | 0.1794 | -0.0395 | 0.3677 | 35/58 | 0.009s | 3.711s |
| Nitidez s=2 a=2 | nitidez | sigma=2, amount=2 | 0.1858 | -0.0332 | 0.3862 | 35/58 | 0.007s | 3.715s |
| Nitidez s=2 a=1 | nitidez | sigma=2, amount=1 | 0.1876 | -0.0313 | 0.3792 | 35/58 | 0.007s | 3.717s |
| Resize x2 + nitidez | pipeline | factor=2, sigma=2, amount=1 | 0.1888 | -0.0301 | 0.3210 | 36/58 | 0.038s | 7.659s |
| CLAHE c=2 t=16 | contraste | clip=2, tile=16x16 | 0.2088 | -0.0102 | 0.3606 | 35/58 | 0.005s | 2.591s |
| Nitidez s=1 a=1.5 | nitidez | sigma=1, amount=1.5 | 0.2106 | -0.0083 | 0.3895 | 34/58 | 0.006s | 3.667s |
| CLAHE c=3 t=8 | contraste | clip=3, tile=8x8 | 0.2128 | -0.0062 | 0.4350 | 23/58 | 0.005s | 1.543s |
| CLAHE c=2 t=8 | contraste | clip=2, tile=8x8 | 0.2131 | -0.0058 | 0.3884 | 33/58 | 0.005s | 2.507s |
| Sin preprocesado | baseline | original | 0.2189 | +0.0000 | 0.3723 | 35/58 | 0.003s | 3.686s |
| CLAHE c=3 t=16 | contraste | clip=3, tile=16x16 | 0.2231 | +0.0042 | 0.4361 | 24/58 | 0.005s | 1.468s |
| CLAHE c=3 t=4 | contraste | clip=3, tile=4x4 | 0.2245 | +0.0056 | 0.4155 | 28/58 | 0.005s | 1.492s |
| Adaptativa mean b=21 c=10 | binarización | method=mean, block=21, C=10 | 0.2466 | +0.0277 | 0.4883 | 28/58 | 0.009s | 2.847s |
| CLAHE c=4 t=8 | contraste | clip=4, tile=8x8 | 0.2476 | +0.0287 | 0.4465 | 26/58 | 0.005s | 1.442s |
| Morfológica open k=2 | morfología | op=open, kernel=2x2 | 0.2503 | +0.0314 | 0.4101 | 33/58 | 0.004s | 3.360s |
| Adaptativa mean b=31 c=10 | binarización | method=mean, block=31, C=10 | 0.2504 | +0.0314 | 0.4677 | 27/58 | 0.009s | 4.152s |
| Nitidez s=2 a=1.5 | nitidez | sigma=2, amount=1.5 | 0.2549 | +0.0360 | 0.4221 | 33/58 | 0.007s | 3.667s |
| Adaptativa gaussian b=31 c=10 | binarización | method=gaussian, block=31, C=10 | 0.2564 | +0.0374 | 0.4620 | 20/58 | 0.026s | 2.279s |
| Nitidez s=1 a=2 | nitidez | sigma=1, amount=2 | 0.2631 | +0.0441 | 0.4366 | 32/58 | 0.006s | 3.892s |
| Adaptativa gaussian b=21 c=10 | binarización | method=gaussian, block=21, C=10 | 0.2760 | +0.0570 | 0.5264 | 18/58 | 0.020s | 2.144s |
| CLAHE c=4 t=16 | contraste | clip=4, tile=16x16 | 0.2856 | +0.0666 | 0.5313 | 22/58 | 0.005s | 1.476s |
| Adaptativa mean b=11 c=10 | binarización | method=mean, block=11, C=10 | 0.2883 | +0.0693 | 0.5540 | 14/58 | 0.009s | 2.418s |
| Adaptativa gaussian b=11 c=10 | binarización | method=gaussian, block=11, C=10 | 0.2946 | +0.0757 | 0.5633 | 18/58 | 0.015s | 3.133s |
| CLAHE c=4 t=4 | contraste | clip=4, tile=4x4 | 0.3298 | +0.1109 | 0.5299 | 22/58 | 0.005s | 1.379s |
| Morfológica close k=2 | morfología | op=close, kernel=2x2 | 0.3553 | +0.1363 | 0.4922 | 32/58 | 0.004s | 3.788s |
| Adaptativa mean b=31 c=2 | binarización | method=mean, block=31, C=2 | 0.3630 | +0.1440 | 0.6374 | 17/58 | 0.009s | 3.443s |
| Adaptativa mean b=31 c=5 | binarización | method=mean, block=31, C=5 | 0.3758 | +0.1568 | 0.5866 | 16/58 | 0.010s | 3.469s |
| Morfológica open k=3 | morfología | op=open, kernel=3x3 | 0.4168 | +0.1978 | 0.5575 | 25/58 | 0.004s | 3.122s |
| Adaptativa mean b=21 c=5 | binarización | method=mean, block=21, C=5 | 0.4346 | +0.2157 | 0.6353 | 17/58 | 0.009s | 4.142s |
| Morfológica close k=3 | morfología | op=close, kernel=3x3 | 0.4396 | +0.2207 | 0.5427 | 30/58 | 0.004s | 1.508s |
| Adaptativa gaussian b=31 c=5 | binarización | method=gaussian, block=31, C=5 | 0.4399 | +0.2210 | 0.6729 | 11/58 | 0.025s | 4.405s |
| Adaptativa gaussian b=21 c=5 | binarización | method=gaussian, block=21, C=5 | 0.4486 | +0.2297 | 0.6751 | 14/58 | 0.020s | 6.181s |
| Adaptativa gaussian b=11 c=5 | binarización | method=gaussian, block=11, C=5 | 0.4533 | +0.2344 | 0.6716 | 16/58 | 0.015s | 2.062s |
| Mediana k=3 | ruido | ksize=3 | 0.4596 | +0.2406 | 0.6026 | 26/58 | 0.004s | 3.645s |
| Adaptativa gaussian b=31 c=2 | binarización | method=gaussian, block=31, C=2 | 0.4982 | +0.2792 | 0.7378 | 7/58 | 0.026s | 4.059s |
| Adaptativa mean b=21 c=2 | binarización | method=mean, block=21, C=2 | 0.4996 | +0.2807 | 0.6776 | 13/58 | 0.010s | 3.853s |
| Adaptativa mean b=11 c=5 | binarización | method=mean, block=11, C=5 | 0.5131 | +0.2941 | 0.7141 | 13/58 | 0.010s | 7.833s |
| Mediana k=5 | ruido | ksize=5 | 0.5531 | +0.3341 | 0.6582 | 24/58 | 0.017s | 2.806s |
| Adaptativa mean b=11 c=2 | binarización | method=mean, block=11, C=2 | 0.5644 | +0.3454 | 0.7849 | 9/58 | 0.008s | 6.397s |
| Adaptativa gaussian b=21 c=2 | binarización | method=gaussian, block=21, C=2 | 0.5809 | +0.3620 | 0.7951 | 6/58 | 0.020s | 5.600s |
| Adaptativa gaussian b=11 c=2 | binarización | method=gaussian, block=11, C=2 | 0.7066 | +0.4877 | 0.8383 | 7/58 | 0.016s | 9.911s |

## PaddleOCR CPU

| Técnica | Familia | Parámetros | CER | dCER | WER | Fragmentos | Pre | OCR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CLAHE c=1 t=16 | contraste | clip=1, tile=16x16 | 0.0878 | -0.0728 | 0.2059 | 46/58 | 0.006s | 74.672s |
| Nitidez s=2 a=1 | nitidez | sigma=2, amount=1 | 0.0884 | -0.0722 | 0.2126 | 46/58 | 0.007s | 74.451s |
| Nitidez s=3 a=1 | nitidez | sigma=3, amount=1 | 0.0902 | -0.0703 | 0.2197 | 42/58 | 0.012s | 107.372s |
| CLAHE c=2 t=4 | contraste | clip=2, tile=4x4 | 0.0922 | -0.0684 | 0.2102 | 47/58 | 0.006s | 71.656s |
| Nitidez s=1 a=1 | nitidez | sigma=1, amount=1 | 0.0969 | -0.0637 | 0.2316 | 46/58 | 0.007s | 78.330s |
| Nitidez s=1 a=1.5 | nitidez | sigma=1, amount=1.5 | 0.0969 | -0.0636 | 0.2361 | 44/58 | 0.006s | 74.145s |
| CLAHE c=1 t=4 | contraste | clip=1, tile=4x4 | 0.0976 | -0.0630 | 0.2146 | 46/58 | 0.006s | 75.374s |
| Nitidez s=1 a=2 | nitidez | sigma=1, amount=2 | 0.0976 | -0.0630 | 0.2383 | 44/58 | 0.006s | 72.309s |
| CLAHE c=2 t=8 | contraste | clip=2, tile=8x8 | 0.0984 | -0.0622 | 0.2197 | 45/58 | 0.006s | 70.009s |
| Nitidez s=3 a=1.5 | nitidez | sigma=3, amount=1.5 | 0.0988 | -0.0618 | 0.2260 | 44/58 | 0.013s | 112.634s |
| Nitidez s=2 a=2 | nitidez | sigma=2, amount=2 | 0.1007 | -0.0599 | 0.2333 | 45/58 | 0.009s | 88.157s |
| CLAHE c=1 t=8 | contraste | clip=1, tile=8x8 | 0.1036 | -0.0569 | 0.2097 | 47/58 | 0.006s | 75.711s |
| Nitidez s=3 a=2 | nitidez | sigma=3, amount=2 | 0.1037 | -0.0569 | 0.2389 | 44/58 | 0.012s | 113.875s |
| Morfológica open k=2 | morfología | op=open, kernel=2x2 | 0.1052 | -0.0554 | 0.2272 | 46/58 | 0.005s | 79.678s |
| Escala de grises | color | BGR2GRAY | 0.1081 | -0.0525 | 0.2358 | 45/58 | 0.003s | 76.780s |
| CLAHE c=2 t=16 | contraste | clip=2, tile=16x16 | 0.1101 | -0.0504 | 0.2336 | 44/58 | 0.006s | 73.622s |
| Nitidez s=2 a=1.5 | nitidez | sigma=2, amount=1.5 | 0.1190 | -0.0416 | 0.2601 | 42/58 | 0.007s | 73.935s |
| Adaptativa mean b=11 c=10 | binarización | method=mean, block=11, C=10 | 0.1252 | -0.0354 | 0.3112 | 38/58 | 0.009s | 67.950s |
| Adaptativa gaussian b=21 c=10 | binarización | method=gaussian, block=21, C=10 | 0.1276 | -0.0329 | 0.2862 | 39/58 | 0.021s | 70.126s |
| Resize x2 + nitidez | pipeline | factor=2, sigma=2, amount=1 | 0.1348 | -0.0258 | 0.2644 | 41/58 | 0.046s | 189.658s |
| Adaptativa gaussian b=11 c=5 | binarización | method=gaussian, block=11, C=5 | 0.1486 | -0.0119 | 0.3181 | 37/58 | 0.017s | 62.055s |
| Bilateral d=5 s=75 | ruido | d=5, sigma=75 | 0.1513 | -0.0093 | 0.2940 | 40/58 | 0.008s | 75.066s |
| Morfológica open k=3 | morfología | op=open, kernel=3x3 | 0.1517 | -0.0089 | 0.3284 | 40/58 | 0.005s | 70.684s |
| Bilateral d=9 s=75 | ruido | d=9, sigma=75 | 0.1549 | -0.0057 | 0.2881 | 42/58 | 0.053s | 77.411s |
| CLAHE c=3 t=8 | contraste | clip=3, tile=8x8 | 0.1557 | -0.0048 | 0.2754 | 43/58 | 0.006s | 70.483s |
| Bilateral d=9 s=50 | ruido | d=9, sigma=50 | 0.1587 | -0.0019 | 0.2906 | 40/58 | 0.054s | 75.354s |
| Bilateral d=5 s=50 | ruido | d=5, sigma=50 | 0.1589 | -0.0017 | 0.3058 | 39/58 | 0.008s | 77.801s |
| Sin preprocesado | baseline | original | 0.1605 | +0.0000 | 0.3133 | 40/58 | 0.003s | 75.305s |
| Adaptativa gaussian b=11 c=10 | binarización | method=gaussian, block=11, C=10 | 0.1656 | +0.0050 | 0.3821 | 33/58 | 0.017s | 66.206s |
| CLAHE c=3 t=4 | contraste | clip=3, tile=4x4 | 0.1706 | +0.0100 | 0.2909 | 40/58 | 0.006s | 70.378s |
| Adaptativa mean b=21 c=10 | binarización | method=mean, block=21, C=10 | 0.1742 | +0.0136 | 0.3838 | 34/58 | 0.009s | 56.199s |
| CLAHE c=3 t=16 | contraste | clip=3, tile=16x16 | 0.1746 | +0.0141 | 0.3159 | 40/58 | 0.006s | 71.922s |
| CLAHE c=4 t=8 | contraste | clip=4, tile=8x8 | 0.1750 | +0.0145 | 0.3147 | 42/58 | 0.006s | 70.250s |
| Adaptativa mean b=31 c=10 | binarización | method=mean, block=31, C=10 | 0.1757 | +0.0152 | 0.3680 | 37/58 | 0.010s | 72.865s |
| CLAHE c=4 t=16 | contraste | clip=4, tile=16x16 | 0.1788 | +0.0182 | 0.2951 | 42/58 | 0.006s | 69.883s |
| CLAHE c=4 t=4 | contraste | clip=4, tile=4x4 | 0.1842 | +0.0237 | 0.3206 | 40/58 | 0.006s | 69.964s |
| Adaptativa gaussian b=31 c=5 | binarización | method=gaussian, block=31, C=5 | 0.1863 | +0.0258 | 0.3535 | 36/58 | 0.027s | 64.310s |
| Otsu | binarización | THRESH_OTSU | 0.1922 | +0.0317 | 0.3509 | 37/58 | 0.005s | 74.853s |
| Resize x2 + CLAHE + Otsu | pipeline | factor=2, CLAHE c=2 t=8, Otsu | 0.1934 | +0.0328 | 0.3270 | 36/58 | 0.054s | 224.621s |
| Adaptativa mean b=31 c=2 | binarización | method=mean, block=31, C=2 | 0.1936 | +0.0330 | 0.4110 | 33/58 | 0.010s | 66.814s |
| Adaptativa gaussian b=31 c=10 | binarización | method=gaussian, block=31, C=10 | 0.1946 | +0.0340 | 0.3673 | 34/58 | 0.026s | 58.501s |
| Adaptativa gaussian b=31 c=2 | binarización | method=gaussian, block=31, C=2 | 0.1961 | +0.0356 | 0.3780 | 35/58 | 0.027s | 63.233s |
| Morfológica close k=2 | morfología | op=close, kernel=2x2 | 0.2041 | +0.0436 | 0.3491 | 39/58 | 0.005s | 75.101s |
| Adaptativa gaussian b=11 c=2 | binarización | method=gaussian, block=11, C=2 | 0.2084 | +0.0478 | 0.4377 | 27/58 | 0.017s | 59.449s |
| Adaptativa mean b=11 c=5 | binarización | method=mean, block=11, C=5 | 0.2119 | +0.0514 | 0.3958 | 32/58 | 0.010s | 55.415s |
| Resize x2 + CLAHE | pipeline | factor=2, CLAHE c=2 t=8 | 0.2156 | +0.0550 | 0.3270 | 40/58 | 0.035s | 169.433s |
| Resize x2 + grises | reescalado | factor=2, INTER_CUBIC | 0.2169 | +0.0564 | 0.3195 | 40/58 | 0.025s | 180.184s |
| Adaptativa gaussian b=21 c=5 | binarización | method=gaussian, block=21, C=5 | 0.2178 | +0.0572 | 0.3760 | 31/58 | 0.021s | 55.918s |
| Resize x2 + Otsu | pipeline | factor=2, Otsu | 0.2213 | +0.0608 | 0.3064 | 42/58 | 0.033s | 192.004s |
| Adaptativa gaussian b=21 c=2 | binarización | method=gaussian, block=21, C=2 | 0.2374 | +0.0768 | 0.4480 | 27/58 | 0.021s | 55.523s |
| Adaptativa mean b=21 c=5 | binarización | method=mean, block=21, C=5 | 0.2412 | +0.0806 | 0.4216 | 30/58 | 0.009s | 68.071s |
| Resize x3 + grises | reescalado | factor=3, INTER_CUBIC | 0.2423 | +0.0817 | 0.3437 | 37/58 | 0.044s | 180.012s |
| Adaptativa mean b=31 c=5 | binarización | method=mean, block=31, C=5 | 0.2573 | +0.0968 | 0.4451 | 33/58 | 0.010s | 71.983s |
| Resize x2.5 + grises | reescalado | factor=2.5, INTER_CUBIC | 0.2682 | +0.1077 | 0.3642 | 36/58 | 0.029s | 188.119s |
| Resize x1.5 + grises | reescalado | factor=1.5, INTER_CUBIC | 0.2783 | +0.1177 | 0.3830 | 36/58 | 0.015s | 141.456s |
| Adaptativa mean b=11 c=2 | binarización | method=mean, block=11, C=2 | 0.3005 | +0.1399 | 0.5453 | 22/58 | 0.010s | 56.720s |
| Adaptativa mean b=21 c=2 | binarización | method=mean, block=21, C=2 | 0.3014 | +0.1408 | 0.4700 | 31/58 | 0.009s | 65.214s |
| Mediana k=3 | ruido | ksize=3 | 0.3051 | +0.1446 | 0.4813 | 30/58 | 0.004s | 78.689s |
| Morfológica close k=3 | morfología | op=close, kernel=3x3 | 0.3064 | +0.1458 | 0.4233 | 36/58 | 0.006s | 85.197s |
| Mediana k=5 | ruido | ksize=5 | 0.3871 | +0.2265 | 0.5119 | 30/58 | 0.016s | 71.956s |

## PaddleOCR GPU

| Técnica | Familia | Parámetros | CER | dCER | WER | Fragmentos | Pre | OCR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CLAHE c=1 t=16 | contraste | clip=1, tile=16x16 | 0.0874 | -0.0553 | 0.2014 | 46/58 | 0.005s | 5.261s |
| Nitidez s=2 a=1 | nitidez | sigma=2, amount=1 | 0.0877 | -0.0550 | 0.2091 | 46/58 | 0.007s | 5.255s |
| CLAHE c=2 t=16 | contraste | clip=2, tile=16x16 | 0.0912 | -0.0515 | 0.2077 | 47/58 | 0.006s | 6.509s |
| CLAHE c=2 t=4 | contraste | clip=2, tile=4x4 | 0.0924 | -0.0503 | 0.2123 | 46/58 | 0.005s | 6.046s |
| Nitidez s=3 a=2 | nitidez | sigma=3, amount=2 | 0.0929 | -0.0498 | 0.2241 | 46/58 | 0.009s | 5.104s |
| Nitidez s=3 a=1 | nitidez | sigma=3, amount=1 | 0.0942 | -0.0485 | 0.2349 | 42/58 | 0.008s | 5.070s |
| Nitidez s=1 a=1 | nitidez | sigma=1, amount=1 | 0.0965 | -0.0462 | 0.2316 | 46/58 | 0.006s | 5.226s |
| Nitidez s=3 a=1.5 | nitidez | sigma=3, amount=1.5 | 0.0976 | -0.0451 | 0.2257 | 43/58 | 0.008s | 5.095s |
| Nitidez s=1 a=1.5 | nitidez | sigma=1, amount=1.5 | 0.0981 | -0.0447 | 0.2410 | 44/58 | 0.006s | 5.331s |
| CLAHE c=1 t=4 | contraste | clip=1, tile=4x4 | 0.0981 | -0.0446 | 0.2146 | 47/58 | 0.006s | 5.577s |
| CLAHE c=2 t=8 | contraste | clip=2, tile=8x8 | 0.0992 | -0.0435 | 0.2197 | 45/58 | 0.006s | 5.283s |
| Nitidez s=2 a=2 | nitidez | sigma=2, amount=2 | 0.1007 | -0.0420 | 0.2305 | 45/58 | 0.007s | 5.127s |
| Nitidez s=1 a=2 | nitidez | sigma=1, amount=2 | 0.1017 | -0.0410 | 0.2510 | 45/58 | 0.006s | 5.295s |
| Morfológica open k=2 | morfología | op=open, kernel=2x2 | 0.1031 | -0.0396 | 0.2215 | 46/58 | 0.005s | 5.605s |
| CLAHE c=1 t=8 | contraste | clip=1, tile=8x8 | 0.1036 | -0.0391 | 0.2120 | 47/58 | 0.006s | 5.297s |
| Nitidez s=2 a=1.5 | nitidez | sigma=2, amount=1.5 | 0.1115 | -0.0313 | 0.2460 | 44/58 | 0.008s | 5.175s |
| CLAHE c=3 t=8 | contraste | clip=3, tile=8x8 | 0.1312 | -0.0116 | 0.2595 | 44/58 | 0.006s | 4.978s |
| CLAHE c=3 t=4 | contraste | clip=3, tile=4x4 | 0.1330 | -0.0097 | 0.2595 | 40/58 | 0.006s | 5.338s |
| Adaptativa gaussian b=11 c=5 | binarización | method=gaussian, block=11, C=5 | 0.1355 | -0.0073 | 0.3189 | 37/58 | 0.017s | 2.768s |
| Sin preprocesado | baseline | original | 0.1427 | +0.0000 | 0.2922 | 41/58 | 0.003s | 5.530s |
| Adaptativa mean b=11 c=10 | binarización | method=mean, block=11, C=10 | 0.1428 | +0.0001 | 0.3209 | 36/58 | 0.009s | 4.510s |
| Adaptativa gaussian b=31 c=10 | binarización | method=gaussian, block=31, C=10 | 0.1451 | +0.0024 | 0.3436 | 35/58 | 0.028s | 2.671s |
| Resize x2 + nitidez | pipeline | factor=2, sigma=2, amount=1 | 0.1475 | +0.0048 | 0.2666 | 40/58 | 0.037s | 18.536s |
| Escala de grises | color | BGR2GRAY | 0.1585 | +0.0158 | 0.2944 | 42/58 | 0.002s | 5.359s |
| Bilateral d=9 s=75 | ruido | d=9, sigma=75 | 0.1594 | +0.0167 | 0.3037 | 41/58 | 0.058s | 6.411s |
| Bilateral d=5 s=75 | ruido | d=5, sigma=75 | 0.1595 | +0.0168 | 0.3009 | 39/58 | 0.009s | 6.542s |
| CLAHE c=4 t=4 | contraste | clip=4, tile=4x4 | 0.1610 | +0.0183 | 0.2950 | 41/58 | 0.006s | 4.945s |
| Morfológica open k=3 | morfología | op=open, kernel=3x3 | 0.1641 | +0.0214 | 0.3390 | 39/58 | 0.004s | 5.652s |
| Adaptativa gaussian b=21 c=10 | binarización | method=gaussian, block=21, C=10 | 0.1642 | +0.0215 | 0.3508 | 35/58 | 0.022s | 4.785s |
| Resize x2 + CLAHE | pipeline | factor=2, CLAHE c=2 t=8 | 0.1674 | +0.0246 | 0.2954 | 42/58 | 0.031s | 20.000s |
| Bilateral d=5 s=50 | ruido | d=5, sigma=50 | 0.1676 | +0.0249 | 0.3221 | 38/58 | 0.008s | 6.985s |
| Bilateral d=9 s=50 | ruido | d=9, sigma=50 | 0.1698 | +0.0271 | 0.3103 | 40/58 | 0.057s | 6.459s |
| CLAHE c=3 t=16 | contraste | clip=3, tile=16x16 | 0.1700 | +0.0273 | 0.3082 | 41/58 | 0.006s | 5.030s |
| Adaptativa gaussian b=31 c=5 | binarización | method=gaussian, block=31, C=5 | 0.1729 | +0.0302 | 0.3750 | 36/58 | 0.029s | 4.453s |
| CLAHE c=4 t=8 | contraste | clip=4, tile=8x8 | 0.1818 | +0.0391 | 0.3148 | 41/58 | 0.005s | 4.677s |
| CLAHE c=4 t=16 | contraste | clip=4, tile=16x16 | 0.1842 | +0.0415 | 0.3031 | 41/58 | 0.006s | 5.010s |
| Otsu | binarización | THRESH_OTSU | 0.1871 | +0.0444 | 0.3372 | 37/58 | 0.005s | 4.750s |
| Resize x2 + CLAHE + Otsu | pipeline | factor=2, CLAHE c=2 t=8, Otsu | 0.1883 | +0.0456 | 0.3086 | 37/58 | 0.048s | 14.997s |
| Adaptativa mean b=21 c=10 | binarización | method=mean, block=21, C=10 | 0.1887 | +0.0460 | 0.3723 | 34/58 | 0.009s | 2.769s |
| Adaptativa gaussian b=11 c=10 | binarización | method=gaussian, block=11, C=10 | 0.1945 | +0.0518 | 0.4151 | 29/58 | 0.017s | 4.122s |
| Adaptativa mean b=31 c=10 | binarización | method=mean, block=31, C=10 | 0.2024 | +0.0597 | 0.3982 | 34/58 | 0.010s | 3.226s |
| Morfológica close k=2 | morfología | op=close, kernel=2x2 | 0.2075 | +0.0648 | 0.3797 | 37/58 | 0.004s | 5.413s |
| Adaptativa mean b=11 c=5 | binarización | method=mean, block=11, C=5 | 0.2080 | +0.0653 | 0.4259 | 31/58 | 0.010s | 2.849s |
| Resize x2 + Otsu | pipeline | factor=2, Otsu | 0.2231 | +0.0804 | 0.3171 | 41/58 | 0.029s | 16.193s |
| Resize x2 + grises | reescalado | factor=2, INTER_CUBIC | 0.2240 | +0.0813 | 0.3279 | 39/58 | 0.020s | 19.650s |
| Adaptativa mean b=21 c=5 | binarización | method=mean, block=21, C=5 | 0.2286 | +0.0859 | 0.4099 | 32/58 | 0.009s | 4.444s |
| Resize x1.5 + grises | reescalado | factor=1.5, INTER_CUBIC | 0.2290 | +0.0863 | 0.3409 | 39/58 | 0.010s | 11.831s |
| Adaptativa gaussian b=31 c=2 | binarización | method=gaussian, block=31, C=2 | 0.2358 | +0.0931 | 0.4643 | 30/58 | 0.028s | 3.554s |
| Resize x3 + grises | reescalado | factor=3, INTER_CUBIC | 0.2401 | +0.0974 | 0.3370 | 38/58 | 0.044s | 41.743s |
| Adaptativa gaussian b=11 c=2 | binarización | method=gaussian, block=11, C=2 | 0.2422 | +0.0995 | 0.4147 | 26/58 | 0.016s | 2.591s |
| Adaptativa mean b=31 c=2 | binarización | method=mean, block=31, C=2 | 0.2424 | +0.0997 | 0.4482 | 30/58 | 0.010s | 4.042s |
| Adaptativa mean b=31 c=5 | binarización | method=mean, block=31, C=5 | 0.2439 | +0.1012 | 0.4221 | 33/58 | 0.009s | 4.731s |
| Adaptativa mean b=21 c=2 | binarización | method=mean, block=21, C=2 | 0.2525 | +0.1098 | 0.4452 | 33/58 | 0.010s | 4.129s |
| Adaptativa gaussian b=21 c=5 | binarización | method=gaussian, block=21, C=5 | 0.2569 | +0.1142 | 0.4280 | 26/58 | 0.023s | 2.831s |
| Adaptativa gaussian b=21 c=2 | binarización | method=gaussian, block=21, C=2 | 0.2645 | +0.1218 | 0.4564 | 26/58 | 0.022s | 2.467s |
| Resize x2.5 + grises | reescalado | factor=2.5, INTER_CUBIC | 0.2800 | +0.1373 | 0.3705 | 37/58 | 0.025s | 30.258s |
| Mediana k=3 | ruido | ksize=3 | 0.3006 | +0.1579 | 0.4738 | 30/58 | 0.004s | 5.916s |
| Morfológica close k=3 | morfología | op=close, kernel=3x3 | 0.3057 | +0.1630 | 0.4406 | 35/58 | 0.004s | 5.418s |
| Adaptativa mean b=11 c=2 | binarización | method=mean, block=11, C=2 | 0.3384 | +0.1956 | 0.5890 | 19/58 | 0.009s | 2.419s |
| Mediana k=5 | ruido | ksize=5 | 0.4043 | +0.2616 | 0.5475 | 29/58 | 0.017s | 6.231s |

_Generado: 2026-06-15T07:21:39.312553+00:00_
