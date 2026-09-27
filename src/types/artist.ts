export interface ArtistGalleryCard {
  readonly imagePath: string
  readonly eyebrow: string
  readonly title: string
  readonly text: string
}

export interface ArtistProfile {
  readonly artist: {
    readonly name: string
    readonly location: string
    readonly email: string
    readonly phone: string
    readonly education: string
    readonly biography: string
    readonly statement: string
    readonly project: {
      readonly title: string
      readonly year: string
      readonly technique: string
      readonly description: string
    }
    readonly exhibitions: readonly { readonly year: string; readonly locations: string }[]
  }
  readonly projectWorks: readonly {
    readonly title: string
    readonly dimensions: string
    readonly technique: string
    readonly description: string
  }[]
  readonly galleryCards: readonly ArtistGalleryCard[]
}
