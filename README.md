# Campus Sentinel --- Wi-Fi Sensing & Mathematical Model

## Overview

The Campus Sentinel Wi-Fi module demonstrates three related
capabilities:

1.  **Wi-Fi Propagation & Coverage Modelling:** virtual access points
    (APs) transmit signals through a 3D campus environment. Estimated
    signal strength changes with distance and obstacles such as walls.
2.  **Human Activity Recognition Through Wi-Fi Sensing:** illustrates
    how a person's movement can alter wireless propagation through
    obstruction, reflection and scattering. Example activity categories
    include walking, stationary presence, reaching/bending and handling
    an object.
3.  **Wi-Fi-Based Spatial Environment Reconstruction:** illustrates how
    signal attenuation and reflected paths may provide information for
    estimating room boundaries and enclosed spaces.

> **Prototype status:** Visualised APs, signal paths, heatmaps, RSSI
> changes and activity sequences are simulations unless a run is
> explicitly based on validated physical measurements. Simulated RSSI is
> not CSI. A visual demonstration alone does not establish real-world
> activity-recognition or room-reconstruction accuracy.

## System workflow

### Environment and access points

-   Represent campus rooms, corridors and walls in a 3D environment.
-   Place virtual APs at defined coordinates.
-   Assign configurable transmit power, reference path loss, path-loss
    exponent and obstacle attenuation.
-   Evaluate signal estimates at points across the environment.

### Propagation and coverage

The model estimates received signal strength at sample points. It
visualises signal-strength heatmaps, individual AP coverage, overlapping
coverage and the strongest-AP region.

### Human activity sensing concept

A person moving through a propagation path can obstruct, reflect or
scatter signal energy. These effects may cause time-varying channel or
received-power observations. The prototype visualises example activity
patterns; reliable recognition requires real measurements, labelled data
and independent evaluation.

### Spatial reconstruction concept

A transmitter emits signals in or near an enclosed room. Direct and
reflected paths interact with room boundaries and objects. In principle,
measured channel responses can support an inverse estimate of the
surrounding geometry. A simulated boundary overlay is conceptual unless
derived from real RF measurements and compared with ground truth.

------------------------------------------------------------------------

## Mathematical model

The equations below form a configurable simulation framework. Parameters
must be documented as measured, sourced, estimated or assumed; they must
not be presented as experimentally calibrated without evidence.

### 1. AP-to-receiver distance

Let the AP position be
(`\mathbf{p}`{=tex}*{AP}=(x*{AP},y\_{AP},z\_{AP})) and receiver position
be (`\mathbf{p}`{=tex}\_{R}=(x_R,y_R,z_R)).

\[ d=\|`\mathbf{p}`{=tex}*{R}-`\mathbf{p}`{=tex}*{AP}\|
=`\sqrt{(x_R-x_{AP})^2+(y_R-y_{AP})^2+(z_R-z_{AP})^2}`{=tex} \]

### 2. Log-distance path-loss model

\[
PL(d)=PL(d_0)+10n`\log`{=tex}*{10}`\left`{=tex}(`\frac{d}{d_0}`{=tex}`\right`{=tex})+X*`\sigma`{=tex}
\]

Where:

-   (PL(d)): path loss at distance (d), in dB.
-   (PL(d_0)): path loss at reference distance (d_0), in dB.
-   (n): environment-dependent path-loss exponent.
-   (X\_`\sigma`{=tex}): optional shadowing term, often modelled as a
    zero-mean Gaussian variable in dB.

For deterministic simulation, set (X\_`\sigma=0`{=tex}). The exponent
(n) should be selected or calibrated for the environment, not treated as
universal.

### 3. Wall and obstacle attenuation

A simplified additive obstacle-loss model is:

\[ L\_{obs}=`\sum`{=tex}\_{i=1}\^{N} k_i A_i \]

Where (N) is the number of obstacle types, (k_i) is the number of
intersections with type (i), and (A_i) is the assigned attenuation per
intersection in dB. This is an approximation; actual attenuation depends
on frequency, material, thickness, geometry and incidence angle.

### 4. Estimated received signal strength

For AP (j):

\[ P\_{R,j}=P\_{T,j}+G\_{T,j}+G_R-PL_j(d)-L\_{obs,j} \]

Where:

-   (P\_{R,j}): estimated received power, in dBm.
-   (P\_{T,j}): AP transmit power, in dBm.
-   (G\_{T,j}), (G_R): transmit and receive antenna gains, in dB.
-   (PL_j(d)): distance-dependent path loss, in dB.
-   (L\_{obs,j}): additional obstacle loss, in dB.

If antenna gains are not modelled separately, they may be absorbed into
a reference term. This produces an estimated RSSI-like value; it is not
CSI.

### 5. Multiple APs and coverage

For receiver position (`\mathbf{p}`{=tex}), evaluate
(P\_{R,j}(`\mathbf{p}`{=tex})) for all (M) APs. The strongest AP is:

\[
j\^\*(`\mathbf{p}`{=tex})=`\arg`{=tex}`\max`{=tex}*{j`\in`{=tex}{1,`\ldots`{=tex},M}}P*{R,j}(`\mathbf{p}`{=tex})
\]

For a coverage threshold (T):

\[ C(`\mathbf{p}`{=tex})=
```{=tex}
\begin{cases}
1,&\max_j P_{R,j}(\mathbf{p})\geq T\\
0,&\text{otherwise}
\end{cases}
```
\]

A heatmap is produced by evaluating the model on a spatial grid and
mapping estimated values to colours.

### 6. Human movement and time-varying signal changes

A simplified received-power model is:

\[ P_R(t)=P\_{base}(t)-L\_{person}(t)+`\epsilon`{=tex}(t) \]

Here (P\_{base}(t)) is the baseline determined by AP/receiver geometry
and static obstacles, (L\_{person}(t)) is a time-varying change
associated with the person's interaction with the propagation path, and
(`\epsilon`{=tex}(t)) represents noise or measurement variation.

A baseline-relative change is:

\[ `\Delta `{=tex}P_R(t)=P_R(t)-`\overline{P}`{=tex}\_{baseline} \]

A time-window feature vector could include:

\[ `\mathbf{f}`{=tex}\_t=
\[`\mu`{=tex}*{`\Delta `{=tex}P},`\sigma`{=tex}*{`\Delta `{=tex}P},`\operatorname{range}`{=tex}(`\Delta `{=tex}P),
`\operatorname{rate\ of\ change}`{=tex},`\operatorname{temporal\ variation}`{=tex}\]
\]

These features may be input to a separately trained and validated
classifier. Scripted movements and synthetic signal changes only
illustrate the concept; they do not prove that an activity can be
reliably inferred from real Wi-Fi measurements.

### 7. Multipath and spatial reconstruction

A simplified complex channel model is:

\[
h(t)=`\sum`{=tex}*{`\ell=1`{=tex}}^{L}a\_`\ell`{=tex}(t)e^{-j2`\pi `{=tex}f_c`\tau`{=tex}*`\ell`{=tex}(t)}
\]

Where (L) is the number of modelled paths, (a\_`\ell`{=tex}(t)) is the
amplitude of path (`\ell`{=tex}), (f_c) is carrier frequency, and
(`\tau`{=tex}\_`\ell`{=tex}(t)) is its propagation delay.

The received signal can be represented as:

\[ y(t)=h(t)\*x(t)+n(t) \]

where (x(t)) is the transmitted signal, (n(t)) is noise, and (\*)
denotes convolution.

Reflections and delays can contain information about boundaries.
Estimating a room from channel observations is an inverse problem: infer
geometry from measured responses. A credible reconstruction requires
real RF observations, a defined AP/antenna configuration, calibration,
an estimation algorithm and comparison with ground-truth geometry.

------------------------------------------------------------------------

## Model parameters

  Parameter          Meaning                                 Unit
  ------------------ --------------------------------------- ---------------
  (P_T)              AP transmit power                       dBm
  (d_0)              Reference distance                      m
  (PL(d_0))          Reference path loss                     dB
  \(n\)              Path-loss exponent                      dimensionless
  (A_i)              Attenuation per obstacle intersection   dB
  (G_T,G_R)          Antenna gains                           dB
  \(T\)              Coverage threshold                      dBm
  (f_c)              Carrier frequency                       Hz
  (`\sigma`{=tex})   Shadowing standard deviation            dB

Record the source of each parameter: device specification, research
reference, simulation assumption or experimental calibration. Do not
invent values and describe them as measured.

## Visual demonstrations

### Scene 1 --- Wi-Fi Propagation & Coverage

-   Campus geometry and virtual AP placement.
-   Signal propagation through open spaces and walls.
-   Signal-strength heatmap.
-   Coverage overlap and strongest-AP regions.

### Scene 2 --- Human Activity Recognition Through Wi-Fi Sensing

-   Person moving or performing a demonstration activity.
-   Direct and reflected signal-path visualisation.
-   Illustrative time-varying signal measurements.
-   Example activity labels, clearly marked as simulated.

### Scene 3 --- Wi-Fi-Based Spatial Environment Reconstruction

-   Transmitter in or near an enclosed room.
-   Illustrative propagation and reflections.
-   Estimated room boundaries.
-   Comparison of known geometry and simulated estimate.

## Evaluation plan

  -----------------------------------------------------------------------
  Capability                          Suggested evaluation
  ----------------------------------- -----------------------------------
  Propagation and coverage            Compare predicted signal levels
                                      with measurements at known
                                      positions; report MAE or RMSE.

  Activity recognition                Use labelled recordings and
                                      independent test
                                      sessions/locations; report
                                      per-class precision, recall and F1.

  Spatial reconstruction              Compare estimated boundaries and
                                      dimensions with ground-truth
                                      measurements; report geometric
                                      error.
  -----------------------------------------------------------------------

## Limitations

-   A propagation heatmap is a model output, not a measured RF survey.
-   RSSI is received signal strength; it is not CSI.
-   RSSI changes alone do not establish identity, intent or exact
    activity.
-   Activity recognition requires measured, labelled data and
    validation.
-   Multipath visualisation alone does not demonstrate successful room
    reconstruction.
-   Real deployments require calibration and testing in the intended
    campus environment.

## Summary

The Campus Sentinel Wi-Fi module combines a log-distance path-loss
model, obstacle attenuation, received-power estimation, temporal signal
variation and multipath channel modelling to demonstrate three distinct
concepts: wireless coverage, human-activity sensing and spatial
environment reconstruction. These models provide a basis for simulation
and future measurement-driven development. Claims about real-world
accuracy should be made only after experimental validation.
