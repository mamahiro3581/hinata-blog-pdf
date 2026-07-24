-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }

# Room creates generated database implementations through reflection.
-keep class * extends androidx.room.RoomDatabase {
    <init>();
}
