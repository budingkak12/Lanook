package com.example.androidclient.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.data.paging.ThumbnailRepository
import com.example.androidclient.data.repository.SessionRepository
import com.example.androidclient.di.NetworkModule
import kotlinx.coroutines.flow.Flow

class MainViewModel : ViewModel() {

    private val repo = ThumbnailRepository(NetworkModule.api, SessionRepository(NetworkModule.api))

    val thumbnails: Flow<PagingData<MediaItem>> =
        repo.thumbnailPager().cachedIn(viewModelScope)
}