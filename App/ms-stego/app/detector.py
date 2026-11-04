"""Contraste Pearson condicional por pares (2k,2k+1), PNG de 8 bits."""
import numpy as np
from scipy.stats import chi2

def calculate(samples):
    values=np.asarray(samples,dtype=np.uint8).reshape(-1)
    histogram=np.bincount(values,minlength=256).astype(np.float64)
    even,odd=histogram[0::2],histogram[1::2]
    totals=even+odd;valid=totals>=10
    pairs=int(valid.sum());n=int(values.size)
    result={'sample_count':n,'eligible_pairs':pairs,'lsb_one_fraction':float(np.mean(values & 1)), 'alpha':0.05,'low_threshold':0.01,'version':'pov-pearson-v1'}
    if n<8192 or pairs<64:
        return 'no_concluyente',result
    # Cada pareja tiene dos categorías, con total observado fijo y una libertad.
    statistic=float(np.sum((even[valid]-odd[valid])**2/totals[valid]))
    p=float(chi2.sf(statistic,pairs))
    result.update(chi_square=statistic,degrees_of_freedom=pairs,equiprobability_p_value=p)
    status='sospechoso' if p>=0.05 else ('sin_indicios' if p<0.01 else 'no_concluyente')
    return status,result
