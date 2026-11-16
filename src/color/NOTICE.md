The native ICC conversion engine uses moxcms 0.8.1, licensed under BSD-3-Clause OR Apache-2.0. Upstream copyright and license files are distributed in the Cargo crate. https://github.com/awxkee/moxcms

Browser matrix/TRC conversions support the bundled sRGB and Display P3 profiles. Custom RGB ICC conversion uses moxcms through the native command. No arbitrary custom profile is approximated by its name. Browser image decoding performs its own display conversion; imported image sources retain their embedded ICC bytes to avoid applying a second conversion to already decoded pixels.
